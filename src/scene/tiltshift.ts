// Tilt-shift, as a photograph of a miniature has it: sharp in a horizontal band, blurring smoothly
// above and below, with colour lifted a little, so a real-size scene reads as a toy. Two separable
// blur passes whose radius grows with distance from the band. Used by style direction 3.

import {
  HalfFloatType,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  type PerspectiveCamera,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

export interface TiltShiftOptions {
  /** The band's centre and half-height, in 0..1 from the bottom of the frame. */
  readonly focus: number;
  readonly band: number;
  /** How far beyond the band the blur reaches its full radius, in 0..1. */
  readonly falloff: number;
  /** The full blur radius, in device pixels. */
  readonly radius: number;
  readonly saturation: number;
}

const vertexShader = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const blurShader = (final: boolean) => `
  uniform sampler2D tInput; uniform vec2 resolution; uniform vec2 direction;
  uniform float focus; uniform float band; uniform float falloff; uniform float radius; uniform float saturation;
  varying vec2 vUv;
  void main() {
    float d = max(0.0, abs(vUv.y - focus) - band);
    float r = radius * smoothstep(0.0, falloff, d);
    vec4 sum = vec4(0.0);
    float weights = 0.0;
    for (int i = -6; i <= 6; i++) {
      float x = float(i) / 6.0;
      float w = exp(-x * x * 2.5);
      sum += texture2D(tInput, vUv + direction * x * r / resolution) * w;
      weights += w;
    }
    vec4 colour = sum / weights;
    ${
      final
        ? `float grey = dot(colour.rgb, vec3(0.2126, 0.7152, 0.0722));
    colour.rgb = mix(vec3(grey), colour.rgb, saturation);
    gl_FragColor = vec4(colour.rgb, 1.0);
    #include <colorspace_fragment>`
        : 'gl_FragColor = colour;'
    }
  }
`;

export class TiltShiftPass {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new WebGLRenderTarget(1, 1, { samples: 4, type: HalfFloatType });
  readonly #half = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  readonly #h: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly #v: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly #ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(renderer: WebGLRenderer, o: TiltShiftOptions) {
    this.#renderer = renderer;
    this.#scene.texture.colorSpace = LinearSRGBColorSpace;
    this.#half.texture.colorSpace = LinearSRGBColorSpace;
    const material = (input: WebGLRenderTarget, direction: Vector2, final: boolean) =>
      new ShaderMaterial({
        uniforms: {
          tInput: { value: input.texture },
          resolution: { value: new Vector2(1, 1) },
          direction: { value: direction },
          focus: { value: o.focus },
          band: { value: o.band },
          falloff: { value: o.falloff },
          radius: { value: o.radius },
          saturation: { value: o.saturation },
        },
        vertexShader,
        fragmentShader: blurShader(final),
        depthTest: false,
        depthWrite: false,
      });
    this.#h = new Mesh(new PlaneGeometry(2, 2), material(this.#scene, new Vector2(1, 0), false));
    this.#v = new Mesh(new PlaneGeometry(2, 2), material(this.#half, new Vector2(0, 1), true));
  }

  setSize(width: number, height: number): void {
    this.#scene.setSize(width, height);
    this.#half.setSize(width, height);
    for (const m of [this.#h, this.#v]) m.material.uniforms.resolution?.value.set(width, height);
  }

  /** Moves the sharp band, for close views. */
  setFocus(focus: number, band: number): void {
    for (const m of [this.#h, this.#v]) {
      if (m.material.uniforms.focus) m.material.uniforms.focus.value = focus;
      if (m.material.uniforms.band) m.material.uniforms.band.value = band;
    }
  }

  render(scene: Scene, camera: PerspectiveCamera): void {
    const r = this.#renderer;
    r.setRenderTarget(this.#scene);
    r.render(scene, camera);
    r.setRenderTarget(this.#half);
    r.render(this.#h, this.#ortho);
    r.setRenderTarget(null);
    r.render(this.#v, this.#ortho);
  }
}
