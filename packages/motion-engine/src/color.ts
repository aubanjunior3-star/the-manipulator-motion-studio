/** Couleurs : le document stocke du sRGB "#RRGGBB" ; le moteur interpole et renvoie en
 *  **linéaire** [r, g, b] ∈ [0, 1] (espace de travail de Three.js, ColorManagement activé). */
import type { Vec3 } from "./math.js";

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function hexToLinear(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
}
