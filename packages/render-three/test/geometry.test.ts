import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { splitGlyphs } from "@manipulator/motion-engine";
import opentype from "opentype.js";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { layoutText, type TextOptions } from "../src/text.js";
import { shapeGeometry } from "../src/shapes.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const font = (file: string) => {
  const b = readFileSync(resolve(root, "assets/builtin/fonts", file));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
const display = font("SpaceGrotesk-Bold.woff");
const ui = font("Inter-Regular.woff");
const opts = (o: Partial<TextOptions>): TextOptions => ({ content: "A", size: 1, extrude: 0, bevel: 0, align: "center", letterSpacing: 0, lineHeight: 1.2, ...o });
const bbox = (glyphs: ReturnType<typeof layoutText>) => {
  const box = new THREE.Box3();
  for (const g of glyphs) {
    if (!g.geometry) continue;
    g.geometry.computeBoundingBox();
    box.union(g.geometry.boundingBox!.clone().translate(g.center));
  }
  return box;
};

describe("mise en page du texte", () => {
  it.each(["MANIPULATOR", "Décris.", "L'IA anime le reste", "3 secondes\npour capter\nl'attention", "Ada Okafor"])(
    "« %s » : un glyphe par caractère non blanc, dans l'ordre du moteur",
    (content) => {
      for (const f of [display, ui]) {
        const g = layoutText(f, opts({ content }));
        expect(g.map((x) => x.char)).toEqual(splitGlyphs(content).map((x) => x.value));
        expect(g.every((x) => x.geometry !== null)).toBe(true);
      }
    },
  );

  it("centré : le bloc est centré sur l'origine", () => {
    const b = bbox(layoutText(display, opts({ content: "MANIPULATOR" })));
    expect(Math.abs(b.min.x + b.max.x) / 2).toBeLessThan(0.08);
    expect(Math.abs(b.min.y + b.max.y) / 2).toBeLessThan(0.08);
  });

  it("left commence en x ≈ 0, right finit en x ≈ 0", () => {
    expect(bbox(layoutText(display, opts({ content: "HELLO", align: "left" }))).min.x).toBeGreaterThan(-0.01);
    expect(bbox(layoutText(display, opts({ content: "HELLO", align: "right" }))).max.x).toBeLessThan(0.01);
  });

  it("la taille met le texte à l'échelle", () => {
    const w1 = bbox(layoutText(display, opts({ content: "HELLO", size: 1 })));
    const w2 = bbox(layoutText(display, opts({ content: "HELLO", size: 2 })));
    expect((w2.max.x - w2.min.x) / (w1.max.x - w1.min.x)).toBeCloseTo(2, 3);
  });

  it("l'espacement des lettres élargit le texte", () => {
    const a = bbox(layoutText(display, opts({ content: "HELLO" })));
    const b = bbox(layoutText(display, opts({ content: "HELLO", letterSpacing: 0.2 })));
    expect(b.max.x - b.min.x).toBeCloseTo(a.max.x - a.min.x + 4 * 0.2, 2);
  });

  it("crénage : le V de « AV » est décalé exactement de la valeur de la police", () => {
    const A = display.charToGlyph("A"), V = display.charToGlyph("V");
    const kern = display.getKerningValue(A, V) / display.unitsPerEm;
    expect(kern).toBeLessThan(0);
    const vAlone = layoutText(display, opts({ content: "V", align: "left" }))[0]!;
    const vInAV = layoutText(display, opts({ content: "AV", align: "left" }))[1]!;
    const advanceA = A.advanceWidth! / display.unitsPerEm;
    expect(vInAV.center.x).toBeCloseTo(vAlone.center.x + advanceA + kern, 6);
  });

  it("plusieurs lignes : chaque ligne est plus bas que la précédente", () => {
    const g = layoutText(display, opts({ content: "A\nB\nC", lineHeight: 1.5 }));
    expect(g[0]!.center.y - g[1]!.center.y).toBeCloseTo(1.5, 1);
    expect(g[1]!.center.y - g[2]!.center.y).toBeCloseTo(1.5, 1);
  });

  it("extrusion : profondeur conforme", () => {
    const [g] = layoutText(display, opts({ content: "H", extrude: 0.25 }));
    g!.geometry!.computeBoundingBox();
    const bb = g!.geometry!.boundingBox!;
    expect(bb.max.z - bb.min.z).toBeCloseTo(0.25, 3);
  });

  it("chaque glyphe est centré sur son pivot", () => {
    for (const g of layoutText(display, opts({ content: "Wg", extrude: 0.2, bevel: 0.02 }))) {
      g.geometry!.computeBoundingBox();
      const c = new THREE.Vector3();
      g.geometry!.boundingBox!.getCenter(c);
      expect(c.length()).toBeLessThan(1e-6);
    }
  });
});

describe("formes", () => {
  it.each([
    { kind: "box" as const, size: [1, 2, 3] },
    { kind: "box" as const, size: [1, 1, 1], corner_radius: 0.2 },
    { kind: "sphere" as const, radius: 0.5 },
    { kind: "cylinder" as const, radius_top: 0, radius_bottom: 0.6, height: 1.2 },
    { kind: "torus" as const, radius: 1, tube: 0.2 },
    { kind: "plane" as const, size: [4, 2] },
    { kind: "rect" as const, size: [7, 0.12], corner_radius: 0.06 },
    { kind: "ellipse" as const, radii: [2.5, 1] },
  ])("$kind : dimensions conformes", (shape) => {
    const geo = shapeGeometry(shape as never);
    geo.computeBoundingBox();
    const s = new THREE.Vector3();
    geo.boundingBox!.getSize(s);
    const expected: Record<string, number[]> = {
      box: (shape as { size?: number[] }).size ?? [1, 1, 1],
      sphere: [1, 1, 1],
      cylinder: [1.2, 1.2, 1.2],
      torus: [2.4, 2.4, 0.4],
      plane: [4, 2, 0],
      rect: [7, 0.12, 0],
      ellipse: [5, 2, 0],
    };
    expected[shape.kind]!.forEach((v, i) => expect(s.getComponent(i)).toBeCloseTo(v, 2));
  });
});
