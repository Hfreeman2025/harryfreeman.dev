// transformers.js for the public site, served at /vendor/transformers/runtime-hosted.js: ask-the-record's
// own runtime (transformers.min.js, from its install, pinned in src/hosting/reception.json) with ONNX
// Runtime's WebAssembly served by this site. It runs the ONNX Runtime build transformers.js itself picks
// for this browser. A build over Cloudflare Pages' 25 MiB a file is served in parts and joined here, and
// runs only if the joined bytes have the pinned length and SHA-256. The model comes from Hugging Face,
// transformers.js's default host.

import * as transformers from './transformers.min.js';

/** Filled by the hosted build (src/hosting/plugin.ts): each build's loader, parts, length and SHA-256. */
const BUILDS = {} /* ORT_BUILDS */;

const wasm = transformers.env.backends.onnx.wasm;
// transformers.js sets its choice as CDN URLs when it loads; only the file name is used here.
const chosen = String(wasm.wasmPaths?.wasm ?? '')
  .split('/')
  .pop();
const build = BUILDS[chosen];
if (!build) throw new Error(`this site has no ONNX Runtime build “${chosen}”`);
const base = new URL('../ort/', import.meta.url);

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

if (build.parts.length === 1) {
  wasm.wasmPaths = { mjs: new URL(build.mjs, base).href, wasm: new URL(build.parts[0], base).href };
} else {
  const parts = await Promise.all(
    build.parts.map(async (name) => {
      const response = await fetch(new URL(name, base));
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    }),
  );
  const length = parts.reduce((n, p) => n + p.byteLength, 0);
  if (length !== build.bytes) throw new Error(`${build.wasm}: ${length} bytes in its parts, expected ${build.bytes}`);
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.byteLength;
  }
  const digest = hex(await crypto.subtle.digest('SHA-256', bytes));
  if (digest !== build.sha256) throw new Error(`${build.wasm}: its parts do not join to the pinned build`);
  wasm.wasmBinary = bytes;
  wasm.wasmPaths = { mjs: new URL(build.mjs, base).href };
}

export const pipeline = transformers.pipeline;
export const env = transformers.env;
