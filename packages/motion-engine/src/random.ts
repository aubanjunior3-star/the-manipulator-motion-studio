/** Aléatoire déterministe : tout dérive de settings.seed (ADR 0003). Jamais Math.random(). */

/** Hachage FNV-1a 32 bits d'une chaîne. */
export function hashString(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Générateur mulberry32 : renvoie une fonction → [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lattice = (seed: number, i: number): number => mulberry32(hashString(String(i), seed))() * 2 - 1;

/** Bruit de gradient 1D lisse, déterministe, à valeurs dans [-1, 1], nul aux entiers. */
export function noise1(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const g0 = lattice(seed, i);
  const g1 = lattice(seed, i + 1);
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return Math.max(-1, Math.min(1, 2 * (g0 * f * (1 - u) + g1 * (f - 1) * u)));
}

/** Permutation déterministe de 0..n-1 (Fisher-Yates). */
export function shuffledIndices(n: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
