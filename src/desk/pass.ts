// The desk's one render pass: ink outlines on everything (the model's graphic look, carried out to the
// desk objects so the picture is one design), then tilt-shift, whose strength the engine animates: full
// at desk scale, pulling to sharp as the camera dives into the office. At zero the blur is skipped.

import {
  Color,
  DepthTexture,
  HalfFloatType,
  LinearSRGBColorSpace,
  Mesh,
  MeshNormalMaterial,
  type Object3D,
  OrthographicCamera,
  type PerspectiveCamera,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

const vertexShader = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class DeskPass {
  readonly #renderer: WebGLRenderer;
  readonly #colour = new WebGLRenderTarget(1, 1, { samples: 4, type: HalfFloatType });
  readonly #normal = new WebGLRenderTarget(1, 1, { depthTexture: new DepthTexture(1, 1), type: HalfFloatType });
  readonly #inked = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  readonly #half = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  readonly #normalMaterial = new MeshNormalMaterial();
  readonly #ink: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly #inkFinal: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly #blurH: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly #blurV: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly #ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** 0 (all sharp) to 1 (the miniature's full tilt-shift). */
  strength = 1;

  constructor(renderer: WebGLRenderer) {
    this.#renderer = renderer;
    for (const t of [this.#colour, this.#inked, this.#half]) t.texture.colorSpace = LinearSRGBColorSpace;
    const ink = (final: boolean) =>
      new ShaderMaterial({
        uniforms: {
          tColour: { value: this.#colour.texture },
          tNormal: { value: this.#normal.texture },
          tDepth: { value: this.#normal.depthTexture },
          resolution: { value: new Vector2(1, 1) },
          width: { value: 1.5 },
          ink: { value: new Color('#1f2433') },
          near: { value: 0.1 },
          far: { value: 200 },
        },
        vertexShader,
        fragmentShader: `
          uniform sampler2D tColour; uniform sampler2D tNormal; uniform sampler2D tDepth;
          uniform vec2 resolution; uniform float width; uniform vec3 ink; uniform float near; uniform float far;
          varying vec2 vUv;
          float linear(vec2 uv) { float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
          vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
          void main() {
            vec4 base = texture2D(tColour, vUv);
            vec2 px = width / resolution;
            float d0 = linear(vUv);
            vec3 n0 = normalAt(vUv);
            float edge = 0.0;
            vec2 o[4];
            o[0] = vec2(px.x, 0.0); o[1] = vec2(-px.x, 0.0); o[2] = vec2(0.0, px.y); o[3] = vec2(0.0, -px.y);
            for (int i = 0; i < 4; i++) {
              vec2 uv = vUv + o[i];
              edge = max(edge, max(step(0.014, abs(linear(uv) - d0) / d0), step(0.4, 1.0 - dot(normalAt(uv), n0))));
            }
            gl_FragColor = vec4(mix(base.rgb, ink, edge * 0.9), 1.0);
            ${final ? '#include <colorspace_fragment>' : ''}
          }`,
        depthTest: false,
        depthWrite: false,
      });
    this.#ink = new Mesh(new PlaneGeometry(2, 2), ink(false));
    this.#inkFinal = new Mesh(new PlaneGeometry(2, 2), ink(true));
    const blur = (input: WebGLRenderTarget, direction: Vector2, final: boolean) =>
      new ShaderMaterial({
        uniforms: {
          tInput: { value: input.texture },
          resolution: { value: new Vector2(1, 1) },
          direction: { value: direction },
          focus: { value: 0.47 },
          band: { value: 0.16 },
          radius: { value: 12 },
          strength: { value: 1 },
        },
        vertexShader,
        fragmentShader: `
          uniform sampler2D tInput; uniform vec2 resolution; uniform vec2 direction;
          uniform float focus; uniform float band; uniform float radius; uniform float strength;
          varying vec2 vUv;
          void main() {
            float d = max(0.0, abs(vUv.y - focus) - band);
            float r = radius * strength * smoothstep(0.0, 0.3, d);
            vec4 sum = vec4(0.0); float weights = 0.0;
            for (int i = -6; i <= 6; i++) {
              float x = float(i) / 6.0; float w = exp(-x * x * 2.5);
              sum += texture2D(tInput, vUv + direction * x * r / resolution) * w; weights += w;
            }
            vec4 c = sum / weights;
            ${final ? 'float g = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); c.rgb = mix(vec3(g), c.rgb, 1.0 + 0.15 * strength); gl_FragColor = vec4(c.rgb, 1.0);\n#include <colorspace_fragment>' : 'gl_FragColor = c;'}
          }`,
        depthTest: false,
        depthWrite: false,
      });
    this.#blurH = new Mesh(new PlaneGeometry(2, 2), blur(this.#inked, new Vector2(1, 0), false));
    this.#blurV = new Mesh(new PlaneGeometry(2, 2), blur(this.#half, new Vector2(0, 1), true));
  }

  setSize(width: number, height: number): void {
    for (const t of [this.#colour, this.#normal, this.#inked, this.#half]) t.setSize(width, height);
    for (const m of [this.#ink, this.#inkFinal, this.#blurH, this.#blurV]) m.material.uniforms.resolution?.value.set(width, height);
    const radius = 12 * Math.min(window.devicePixelRatio, 2);
    for (const m of [this.#blurH, this.#blurV]) if (m.material.uniforms.radius) m.material.uniforms.radius.value = radius;
  }

  /** Where the sharp band sits (0 bottom, 1 top) and how tall it is. */
  setFocus(focus: number, band: number): void {
    for (const m of [this.#blurH, this.#blurV]) {
      if (m.material.uniforms.focus) m.material.uniforms.focus.value = focus;
      if (m.material.uniforms.band) m.material.uniforms.band.value = band;
    }
  }

  render(scene: Scene, camera: PerspectiveCamera): void {
    const r = this.#renderer;
    for (const m of [this.#ink, this.#inkFinal]) {
      if (m.material.uniforms.near) m.material.uniforms.near.value = camera.near;
      if (m.material.uniforms.far) m.material.uniforms.far.value = camera.far;
    }
    r.setRenderTarget(this.#colour);
    r.render(scene, camera);
    // Normals and depth, for the ink; shadows, glows and painted words draw no line.
    const hidden: Object3D[] = [];
    scene.traverse((o) => {
      if (o.visible && o.userData.noEdge) {
        o.visible = false;
        hidden.push(o);
      }
    });
    const background = scene.background;
    scene.background = null;
    scene.overrideMaterial = this.#normalMaterial;
    const shadows = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.#normal);
    r.render(scene, camera);
    r.shadowMap.autoUpdate = shadows;
    scene.overrideMaterial = null;
    scene.background = background;
    for (const o of hidden) o.visible = true;
    if (this.strength < 0.01) {
      r.setRenderTarget(null);
      r.render(this.#inkFinal, this.#ortho);
      return;
    }
    for (const m of [this.#blurH, this.#blurV]) if (m.material.uniforms.strength) m.material.uniforms.strength.value = this.strength;
    r.setRenderTarget(this.#inked);
    r.render(this.#ink, this.#ortho);
    r.setRenderTarget(this.#half);
    r.render(this.#blurH, this.#ortho);
    r.setRenderTarget(null);
    r.render(this.#blurV, this.#ortho);
  }
}
