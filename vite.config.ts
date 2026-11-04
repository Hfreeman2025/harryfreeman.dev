import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { defineConfig, type Plugin } from 'vite';
import { BRIEFS_HTML } from './src/content/briefs';
import { parseConfig } from './src/content/config';
import { renderList, renderRoomLabels, renderTimelineJson } from './src/content/render';
import { renderCabinet, renderDirectory, renderPlan } from './src/office/render';
import placeholder from './src/timeline/placeholder.json' with { type: 'json' };
import { parseTimeline, type Timeline } from './src/timeline/schema';

const root = dirname(fileURLToPath(import.meta.url));
const personal = resolve(root, '..');
/** ask-the-record is used from its own folder, read-only: its built element, runtime and model. */
const atr = join(personal, 'oss', 'ask-the-record');

interface TimelineSource {
  readonly timeline: Timeline;
  readonly origin: 'real' | 'placeholder';
  readonly problem?: string;
}

function loadTimeline(strict: boolean): TimelineSource {
  const path = process.env.STUDIO_TIMELINE ?? join(personal, 'site-data', 'timeline.json');
  if (!existsSync(path)) return { timeline: parseTimeline(placeholder), origin: 'placeholder' };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return { timeline: parseTimeline(parsed), origin: 'real' };
  } catch (error) {
    const problem = `${path}: ${error instanceof Error ? error.message : String(error)}`;
    // A broken real timeline fails the build; in development the page says so and plays the placeholder.
    if (strict) throw new Error(problem);
    return { timeline: parseTimeline(placeholder), origin: 'placeholder', problem };
  }
}

/** Files served from sibling folders, by URL prefix. Only listed files are served. */
const VENDOR: ReadonlyArray<{ prefix: string; dir: string; files: readonly string[] }> = [
  { prefix: '/vendor/ask-the-record/', dir: join(atr, 'dist'), files: ['ask-the-record.min.js', 'ask-the-record-explain.min.js'] },
  { prefix: '/vendor/transformers/', dir: join(atr, 'node_modules/@huggingface/transformers/dist'), files: ['transformers.min.js'] },
  {
    prefix: '/vendor/ort/',
    dir: join(atr, 'node_modules/onnxruntime-web/dist'),
    files: [
      'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm',
      'ort-wasm-simd-threaded.asyncify.mjs',
      'ort-wasm-simd-threaded.asyncify.wasm',
      'ort-wasm-simd-threaded.jsep.mjs',
      'ort-wasm-simd-threaded.jsep.wasm',
    ],
  },
  {
    prefix: '/models/Xenova/all-MiniLM-L6-v2/resolve/main/',
    dir: join(atr, 'node_modules/@huggingface/transformers/.cache/Xenova/all-MiniLM-L6-v2'),
    files: ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'],
  },
];

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.onnx': 'application/octet-stream',
};

function serveVendor(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const url = (req.url ?? '').split('?')[0] ?? '';
  for (const v of VENDOR) {
    if (!url.startsWith(v.prefix)) continue;
    const file = decodeURIComponent(url.slice(v.prefix.length));
    if (!v.files.includes(file)) break;
    const path = join(v.dir, file);
    if (!existsSync(path)) {
      res.statusCode = 404;
      res.end(`missing ${file}: is ${v.dir} present?`);
      return;
    }
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(statSync(path).size));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(readFileSync(path));
    return;
  }
  next();
}

function studio(): Plugin {
  let strict = false;
  let outDir = 'dist';
  return {
    name: 'studio',
    configResolved(config) {
      strict = config.command === 'build';
      outDir = resolve(root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(serveVendor);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveVendor);
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const config = parseConfig(JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8')));
        if (ctx.filename.endsWith('cv.html')) {
          const body = marked.parse(readFileSync(join(root, 'src/content/cv.md'), 'utf8'), { async: false });
          return html.replace('<!--cv:body-->', body).replaceAll('%EMAIL%', config.email).replaceAll('%LINKEDIN%', config.linkedin);
        }
        if (!ctx.filename.endsWith('index.html')) return html;
        const source = loadTimeline(strict);
        const status = source.problem
          ? `<p class="timeline-problem" role="alert">The real timeline could not be read (${source.problem.replace(/[<>&]/g, '')}). Playing the placeholder instead.</p>`
          : '';
        return html
          .replace('<!--room:labels-->', renderRoomLabels())
          .replace('<!--studio:briefs-->', BRIEFS_HTML)
          .replace('<!--office:directory-->', renderDirectory())
          .replace('<!--office:cabinet-->', renderCabinet())
          .replace('<!--office:plan-->', renderPlan())
          .replace('<!--studio:list-->', renderList(config, source.timeline))
          .replace('<!--studio:timeline-->', renderTimelineJson(source.timeline) + status)
          .replaceAll('%CV%', config.cv)
          .replaceAll('%EMAIL%', config.email)
          .replaceAll('%LINKEDIN%', config.linkedin)
          .replaceAll('%TIMELINE_ORIGIN%', source.origin);
      },
    },
    closeBundle() {
      // Hosting later: copy the sibling files into the build. Off by default to save disk.
      if (!strict || process.env.STUDIO_COPY_VENDOR !== '1') return;
      for (const v of VENDOR) {
        for (const file of v.files) {
          const from = join(v.dir, file);
          if (!existsSync(from)) continue;
          const to = join(outDir, v.prefix, file);
          mkdirSync(dirname(to), { recursive: true });
          copyFileSync(from, to);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [studio()],
  build: {
    target: 'es2022',
    // No injected modulepreload links: WebKit warns when one re-preloads a chunk the page already ran.
    // The page starts its own lazy chunks in parallel instead (src/main.ts).
    modulePreload: false,
    // Three.js is one chunk by nature, loaded after first paint.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        index: join(root, 'index.html'),
        cv: join(root, 'cv.html'),
        terminal: join(root, 'terminal.html'),
      },
    },
  },
  server: {
    fs: { strict: true },
    // File events are missed on this busy machine; polling is reliable.
    watch: { usePolling: true, interval: 400, ignored: ['**/node_modules/**', '**/.tmp/**', '**/public/loops/**', '**/dist/**'] },
  },
});
