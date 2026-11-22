import { describe, expect, it } from "vitest";
import { bezier, EASES } from "../src/ease.js";
import { hexToLinear } from "../src/color.js";
import { mat4Compose, mat4Rotation, quatAxisAngle, quatFromEulerDeg, quatLookDirection, quatMul, rotateVec, DEG } from "../src/math.js";
import { hashString, noise1, shuffledIndices } from "../src/random.js";
import { splitGlyphs, unitCount } from "../src/text.js";

const close = (a: number[], b: number[], eps = 1e-6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, -Math.log10(eps)));

describe("easings", () => {
  it.each(Object.keys(EASES))("%s vaut 0 en 0 et 1 en 1", (name) => {
    const f = EASES[name]!;
    expect(f(0)).toBeCloseTo(0, 9);
    expect(f(1)).toBeCloseTo(1, 9);
  });

  it.each(["linear", "ease_in", "ease_out", "ease_in_out", "ease_in_strong", "ease_out_strong", "ease_in_out_strong"])(
    "%s est croissante",
    (name) => {
      const f = EASES[name]!;
      for (let p = 0; p < 1; p += 0.01) expect(f(p + 0.01)).toBeGreaterThanOrEqual(f(p) - 1e-12);
    },
  );

  it("hold reste à 0 jusqu'à la fin du segment", () => {
    expect(EASES.hold!(0.999)).toBe(0);
    expect(EASES.hold!(1)).toBe(1);
  });

  it("back_out dépasse 1 (rebond)", () => {
    expect(Math.max(...Array.from({ length: 100 }, (_, i) => EASES.back_out!(i / 100)))).toBeGreaterThan(1.05);
  });

  it("Bézier : (0,0,1,1) est linéaire ; 'ease' CSS ≈ 0.8024 à mi-parcours", () => {
    const lin = bezier(0, 0, 1, 1);
    for (const p of [0.1, 0.37, 0.5, 0.9]) expect(lin(p)).toBeCloseTo(p, 6);
    expect(bezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });
});

describe("couleurs", () => {
  it("sRGB → linéaire", () => {
    close(hexToLinear("#ffffff"), [1, 1, 1]);
    close(hexToLinear("#000000"), [0, 0, 0]);
    expect(hexToLinear("#808080")[0]).toBeCloseTo(0.2158, 3);
  });
});

describe("géométrie", () => {
  it("Euler XYZ = Rx · Ry · Rz (convention Three.js)", () => {
    const e: [number, number, number] = [30, -45, 60];
    const expected = quatMul(quatMul(quatAxisAngle([1, 0, 0], 30 * DEG), quatAxisAngle([0, 1, 0], -45 * DEG)), quatAxisAngle([0, 0, 1], 60 * DEG));
    close(quatFromEulerDeg(e), expected);
  });

  it("90° autour de Y envoie +X sur −Z", () => {
    close(rotateVec(quatFromEulerDeg([0, 90, 0]), [1, 0, 0]), [0, 0, -1]);
  });

  it("caméra en +Z visant l'origine : orientation identité", () => {
    close(quatLookDirection([0, 0, -10], true), [0, 0, 0, 1]);
  });

  it("un objet visant +X a son axe +Z tourné vers +X", () => {
    close(rotateVec(quatLookDirection([5, 0, 0], false), [0, 0, 1]), [1, 0, 0]);
  });

  it("extraction de la rotation d'une matrice avec échelle", () => {
    const q = quatFromEulerDeg([10, 20, 30]);
    const m = mat4Compose([1, 2, 3], q, [2, 3, 4]);
    const r = mat4Rotation(m);
    const sign = Math.sign(r[3]) === Math.sign(q[3]) ? 1 : -1;
    close(r.map((v) => v * sign), q);
  });
});

describe("aléatoire déterministe", () => {
  it("même graine ⇒ même suite", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(noise1(42, 3.7)).toBe(noise1(42, 3.7));
    expect(noise1(42, 3.7)).not.toBe(noise1(43, 3.7));
  });

  it("bruit borné dans [-1, 1], nul aux entiers", () => {
    for (let x = 0; x < 50; x += 0.13) {
      const v = noise1(7, x);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(noise1(7, 4)).toBeCloseTo(0, 12);
  });

  it("permutation complète", () => {
    const p = shuffledIndices(20, 99);
    expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(shuffledIndices(20, 99)).toEqual(p);
  });
});

describe("découpage du texte", () => {
  it("lettres, mots, lignes (blancs exclus)", () => {
    const g = splitGlyphs("AB CD\nEF");
    expect(g.map((x) => x.value).join("")).toBe("ABCDEF");
    expect(g.map((x) => x.word)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(g.map((x) => x.line)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(unitCount(g, "char")).toBe(6);
    expect(unitCount(g, "word")).toBe(3);
    expect(unitCount(g, "line")).toBe(2);
  });

  it("accents et apostrophes comptent comme des lettres", () => {
    expect(splitGlyphs("L'IA décide").length).toBe(10);
  });
});
