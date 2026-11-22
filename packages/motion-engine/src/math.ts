/** Mathématiques minimales du moteur. Conventions identiques à Three.js :
 *  quaternions [x, y, z, w], Euler en ordre XYZ, matrices 4×4 en colonnes (column-major). */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Mat4 = number[]; // 16 éléments, column-major

export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  if (e1 <= e0) return x >= e1 ? 1 : 0;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  mul: (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]],
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  norm: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
  },
  cross: (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

/** Identique à THREE.Quaternion.setFromEuler(new Euler(x, y, z, "XYZ")), angles en degrés. */
export function quatFromEulerDeg(e: Vec3): Quat {
  const c1 = Math.cos((e[0] * DEG) / 2), s1 = Math.sin((e[0] * DEG) / 2);
  const c2 = Math.cos((e[1] * DEG) / 2), s2 = Math.sin((e[1] * DEG) / 2);
  const c3 = Math.cos((e[2] * DEG) / 2), s3 = Math.sin((e[2] * DEG) / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

export function quatAxisAngle(axis: Vec3, rad: number): Quat {
  const n = v3.norm(axis);
  const s = Math.sin(rad / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(rad / 2)];
}

/** Produit a × b (applique b puis a). */
export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export const quatConj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return l > 0 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : [0, 0, 0, 1];
}

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const p = quatMul(quatMul(q, [v[0], v[1], v[2], 0]), quatConj(q));
  return [p[0], p[1], p[2]];
}

/** Orientation qui pointe l'axe `forward` local vers `dir` (monde), avec Y comme « haut ».
 *  Comme Object3D.lookAt de Three : les caméras et lumières visent −Z, les objets +Z. */
export function quatLookDirection(dir: Vec3, forwardIsNegZ: boolean, up: Vec3 = [0, 1, 0]): Quat {
  let z = v3.norm(forwardIsNegZ ? v3.scale(dir, -1) : dir);
  if (v3.len(z) === 0) return [...QUAT_IDENTITY];
  let x = v3.cross(up, z);
  if (v3.len(x) < 1e-8) {
    // dir colinéaire à up : choisit un autre axe de référence
    z = [z[0] + 1e-4, z[1], z[2]];
    z = v3.norm(z);
    x = v3.cross(up, z);
  }
  x = v3.norm(x);
  const y = v3.cross(z, x);
  // matrice de rotation [x y z] → quaternion
  const m00 = x[0], m01 = y[0], m02 = z[0];
  const m10 = x[1], m11 = y[1], m12 = z[1];
  const m20 = x[2], m21 = y[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return quatNormalize(q);
}

export function mat4Compose(p: Vec3, q: Quat, s: Vec3): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    p[0], p[1], p[2], 1,
  ];
}

export function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = sum;
    }
  return out;
}

export const mat4Position = (m: Mat4): Vec3 => [m[12]!, m[13]!, m[14]!];

/** Rotation pure (sans échelle) d'une matrice monde, en quaternion. Suppose une échelle positive. */
export function mat4Rotation(m: Mat4): Quat {
  const sx = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
  const sy = Math.hypot(m[4]!, m[5]!, m[6]!) || 1;
  const sz = Math.hypot(m[8]!, m[9]!, m[10]!) || 1;
  const x: Vec3 = [m[0]! / sx, m[1]! / sx, m[2]! / sx];
  const y: Vec3 = [m[4]! / sy, m[5]! / sy, m[6]! / sy];
  const z: Vec3 = [m[8]! / sz, m[9]! / sz, m[10]! / sz];
  const tr = x[0] + y[1] + z[2];
  let q: Quat;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = [(y[2] - z[1]) * s, (z[0] - x[2]) * s, (x[1] - y[0]) * s, 0.25 / s];
  } else if (x[0] > y[1] && x[0] > z[2]) {
    const s = 2 * Math.sqrt(1 + x[0] - y[1] - z[2]);
    q = [0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s];
  } else if (y[1] > z[2]) {
    const s = 2 * Math.sqrt(1 + y[1] - x[0] - z[2]);
    q = [(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s];
  } else {
    const s = 2 * Math.sqrt(1 + z[2] - x[0] - y[1]);
    q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s];
  }
  return quatNormalize(q);
}

export const AXES: Record<"x" | "y" | "z", Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
