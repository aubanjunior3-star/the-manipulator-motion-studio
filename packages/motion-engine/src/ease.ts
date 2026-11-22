/** Courbes d'interpolation. Entrée p ∈ [0, 1] (bornée), sortie normalement dans [0, 1]
 *  (les courbes « back » et certaines Bézier dépassent volontairement). */
import type { BezierEase } from "@manipulator/scene-schema";

export type EaseFn = (p: number) => number;

const C1 = 1.70158;
const C3 = C1 + 1;

export const EASES: Record<string, EaseFn> = {
  linear: (p) => p,
  hold: (p) => (p < 1 ? 0 : 1),
  ease_in: (p) => p * p * p,
  ease_out: (p) => 1 - (1 - p) ** 3,
  ease_in_out: (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
  ease_in_strong: (p) => p ** 5,
  ease_out_strong: (p) => 1 - (1 - p) ** 5,
  ease_in_out_strong: (p) => (p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2),
  back_in: (p) => C3 * p * p * p - C1 * p * p,
  back_out: (p) => 1 + C3 * (p - 1) ** 3 + C1 * (p - 1) ** 2,
};

/** Bézier cubique façon CSS cubic-bezier(x1, y1, x2, y2). */
export function bezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sy = (s: number) => ((ay * s + by) * s + cy) * s;
  const dsx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let s = p;
    for (let i = 0; i < 8; i++) {
      const err = sx(s) - p;
      if (Math.abs(err) < 1e-7) return sy(s);
      const d = dsx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0, hi = 1;
    s = p;
    for (let i = 0; i < 40; i++) {
      const x = sx(s);
      if (Math.abs(x - p) < 1e-7) break;
      if (x < p) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return sy(s);
  };
}

export function resolveEase(ease: string | BezierEase | undefined, fallback = "ease_in_out"): EaseFn {
  if (ease === undefined) return EASES[fallback]!;
  if (typeof ease === "string") {
    const fn = EASES[ease];
    if (!fn) throw new Error(`Easing inconnu : '${ease}'`);
    return fn;
  }
  return bezier(ease.x1, ease.y1, ease.x2, ease.y2);
}

export const applyEase = (fn: EaseFn, p: number): number => fn(p <= 0 ? 0 : p >= 1 ? 1 : p);
