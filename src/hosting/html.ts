// The pages as the public site serves them: canonical and social-card URLs on the public origin,
// Reception's model from Hugging Face (where it is published) and its runtime from this site, and the
// sentences that would be untrue off Harry's machine said as they are there. Every change is required
// to apply: if the page it expects has changed, the hosted build fails instead of shipping a stale claim.

export type Page = 'index' | 'cv' | 'stamps' | 'terminal';

/** The path Cloudflare Pages serves each page at (it redirects /cv.html to /cv). */
export const PAGE_PATHS: Record<Page, string> = { index: '/', cv: '/cv', stamps: '/stamps', terminal: '/terminal' };

export function pageOf(filename: string): Page | null {
  const base = filename
    .split('/')
    .pop()
    ?.replace(/\.html$/, '');
  return base && base in PAGE_PATHS ? (base as Page) : null;
}

type Swap = readonly [from: string, to: string];

/** index.html's copy, as it reads on the public site. */
export const INDEX_COPY: readonly Swap[] = [
  [
    'Pull a drawer, then a folder: each holds a recorded loop of the tool and a way to open it live.',
    'Pull a drawer, then a folder: each holds a recorded loop of the tool, its brief, its checks and its receipt.',
  ],
  [
    'The loops were recorded from the real tools in a silent headless browser and are labelled recorded; <strong>Open</strong> launches the tool live.',
    'The loops were recorded from the real tools in a silent headless browser and are labelled recorded. The tools run on Harry’s machine, so here you see their recordings; the two terminal tools open their recorded sessions.',
  ],
  [
    'your own question loads the meaning model on first use, about 50 MB, served from this site and cached.',
    'your own question loads the meaning model on first use: all-MiniLM-L6-v2 (about 23 MB) from Hugging Face, where it is published, and ONNX Runtime’s WebAssembly (about 26 MB) from this site, both cached.',
  ],
  [
    'One request to another site, for the grid’s current carbon intensity (NESO, CC BY 4.0); the radio makes more only while it plays.',
    'One request to another site, for the grid’s current carbon intensity (NESO, CC BY 4.0); the radio makes more only while it plays, and Reception fetches its meaning model from Hugging Face only when you ask your own question.',
  ],
  // Reception: no local model host, so transformers.js uses its default, Hugging Face.
  [' model-host="/models/"', ''],
  ['runtime="/vendor/transformers/runtime.js"', 'runtime="/vendor/transformers/runtime-hosted.js"'],
];

function swap(html: string, [from, to]: Swap, page: Page): string {
  const at = html.indexOf(from);
  if (at < 0) throw new Error(`hosted build: ${page}.html no longer contains “${from.slice(0, 80)}”; update src/hosting/html.ts`);
  if (html.indexOf(from, at + from.length) >= 0) throw new Error(`hosted build: “${from.slice(0, 80)}” appears twice in ${page}.html`);
  return html.slice(0, at) + to + html.slice(at + from.length);
}

export function hostedHtml(html: string, page: Page, origin: string): string {
  let out = html;
  if (page === 'index') for (const s of INDEX_COPY) out = swap(out, s, page);
  const url = `${origin}${PAGE_PATHS[page]}`;
  // Social cards need absolute URLs.
  out = out.replace(/(<meta property="og:image" content=")\/(?!\/)/g, `$1${origin}/`);
  const head = [`<link rel="canonical" href="${url}">`];
  if (out.includes('property="og:')) head.push(`<meta property="og:url" content="${url}">`);
  if (!out.includes('</head>')) throw new Error(`hosted build: ${page}.html has no </head>`);
  if (out.includes('rel="canonical"')) throw new Error(`hosted build: ${page}.html already has a canonical link`);
  return out.replace('</head>', `  ${head.join('\n  ')}\n</head>`);
}
