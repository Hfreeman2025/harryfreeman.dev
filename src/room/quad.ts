// The CSS transform that maps a w × h box onto any four points on screen: a projective transform
// (a homography), written as matrix3d. The desk's screen video uses it to sit exactly on the monitor
// as the camera sees it, from slightly above, rather than on its bounding box.

type Point = readonly [number, number];
type M3 = [number, number, number, number, number, number, number, number, number];

function adjugate(m: M3): M3 {
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ];
}
function multiply(a: M3, b: M3): M3 {
  const c: number[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += (a[3 * i + k] ?? 0) * (b[3 * k + j] ?? 0);
      c.push(sum);
    }
  return c as M3;
}
function apply(m: M3, v: readonly [number, number, number]): [number, number, number] {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
/** The matrix taking the projective basis to four points. */
function basis(p: readonly [Point, Point, Point, Point]): M3 {
  const m: M3 = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
  const v = apply(adjugate(m), [p[3][0], p[3][1], 1]);
  return multiply(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/** matrix3d(...) taking the box (0,0)–(w,h) to the corners top-left, top-right, bottom-right, bottom-left. */
export function quadTransform(w: number, h: number, corners: readonly [Point, Point, Point, Point]): string {
  const src = basis([
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]);
  const dst = basis(corners);
  const t = multiply(dst, adjugate(src));
  const n = t.map((x) => x / t[8]);
  const f = (x: number | undefined) => (x ?? 0).toFixed(9);
  return `matrix3d(${f(n[0])}, ${f(n[3])}, 0, ${f(n[6])}, ${f(n[1])}, ${f(n[4])}, 0, ${f(n[7])}, 0, 0, 1, 0, ${f(n[2])}, ${f(n[5])}, 0, ${f(n[8])})`;
}

/** Where the transform sends a point of the box, for checking it. */
export function mapPoint(transform: string, x: number, y: number): Point {
  const v = (/matrix3d\((.+)\)/.exec(transform)?.[1] ?? '').split(',').map(Number);
  const [a, b, , d, e, f2, , h, , , , , m, n, , p] = v;
  const X = (a ?? 0) * x + (e ?? 0) * y + (m ?? 0);
  const Y = (b ?? 0) * x + (f2 ?? 0) * y + (n ?? 0);
  const W = (d ?? 0) * x + (h ?? 0) * y + (p ?? 1);
  return [X / W, Y / W];
}
