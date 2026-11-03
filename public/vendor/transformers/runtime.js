// transformers.js, from ask-the-record's own install, with onnxruntime's WebAssembly served by this
// site rather than a CDN, so asking the studio makes no request to another site.
import * as transformers from './transformers.min.js';

transformers.env.backends.onnx.wasm.wasmPaths = new URL('../ort/', import.meta.url).href;

export const pipeline = transformers.pipeline;
export const env = transformers.env;
