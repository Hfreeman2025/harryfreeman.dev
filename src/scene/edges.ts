// Ink outlines drawn on the finished frame, as comic and technical drawings have them: edges are
// found where depth or surface direction jumps between neighbouring pixels, so boxes, models and
// characters all get the same line, without touching their geometry. Used by style frames B and C.

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

export interface EdgeOptions {
  readonly color: string;
  /** Line width in device pixels. */
  readonly width: number;
  readonly strength: number;
  readonly normalThreshold: number;
  readonly depthThreshold: number;
}

export class EdgePass {
  readonly #renderer: WebGLRenderer;
  readonly #color = new WebGLRenderTarget(1, 1, { samples: 4, type: HalfFloatType });
  readonly #normal = new WebGLRenderTarget(1, 1, { depthTexture: new DepthTexture(1, 1), type: HalfFloatType });
  readonly #normalMaterial = new MeshNormalMaterial();
  readonly #quad: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly #ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(renderer: WebGLRenderer, o: EdgeOptions) {
    this.#renderer = renderer;
    this.#color.texture.colorSpace = LinearSRGBColorSpace;
    this.#quad = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        uniforms: {
          tColor: { value: this.#color.texture },
          tNormal: { value: this.#normal.texture },
          tDepth: { value: this.#normal.depthTexture },
          resolution: { value: new Vector2(1, 1) },
          width: { value: o.width },
          strength: { value: o.strength },
          ink: { value: new Color(o.color) },
          normalThreshold: { value: o.normalThreshold },
          depthThreshold: { value: o.depthThreshold },
          near: { value: 0.1 },
          far: { value: 200 },
        },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
          uniform sampler2D tColor; uniform sampler2D tNormal; uniform sampler2D tDepth;
          uniform vec2 resolution; uniform float width; uniform float strength; uniform vec3 ink;
          uniform float normalThreshold; uniform float depthThreshold; uniform float near; uniform float far;
          varying vec2 vUv;
          float linear(vec2 uv) {
            float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
            return 2.0 * near * far / (far + near - z * (far - near));
          }
          vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
          void main() {
            vec4 base = texture2D(tColor, vUv);
            vec2 px = width / resolution;
            float d0 = linear(vUv);
            vec3 n0 = normalAt(vUv);
            float edge = 0.0;
            vec2 offsets[4];
            offsets[0] = vec2(px.x, 0.0); offsets[1] = vec2(-px.x, 0.0); offsets[2] = vec2(0.0, px.y); offsets[3] = vec2(0.0, -px.y);
            for (int i = 0; i < 4; i++) {
              vec2 uv = vUv + offsets[i];
              float dd = abs(linear(uv) - d0) / d0;
              float nd = 1.0 - dot(normalAt(uv), n0);
              edge = max(edge, max(step(depthThreshold, dd), step(normalThreshold, nd)));
            }
            gl_FragColor = vec4(mix(base.rgb, ink, edge * strength), 1.0);
            #include <colorspace_fragment>
          }
        `,
        depthTest: false,
        depthWrite: false,
      }),
    );
  }

  setSize(width: number, height: number): void {
    this.#color.setSize(width, height);
    this.#normal.setSize(width, height);
    this.#quad.material.uniforms.resolution?.value.set(width, height);
  }

  /** Renders the scene with outlines; objects with userData.noEdge (shadows, glows) draw no line. */
  render(scene: Scene, camera: PerspectiveCamera): void {
    const r = this.#renderer;
    const u = this.#quad.material.uniforms;
    if (u.near) u.near.value = camera.near;
    if (u.far) u.far.value = camera.far;
    r.setRenderTarget(this.#color);
    r.render(scene, camera);
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
    r.setRenderTarget(this.#normal);
    r.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = background;
    for (const o of hidden) o.visible = true;
    r.setRenderTarget(null);
    r.render(this.#quad, this.#ortho);
  }
}
