import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SceneDocument } from "@manipulator/scene-schema";
import { describe, expect, it } from "vitest";
import { createEvaluator, evaluate, UnsupportedFeatureError } from "../src/index.js";
import { rotateVec, type Vec3 } from "../src/math.js";
import { makeDoc } from "./helpers.js";

type Anim = NonNullable<SceneDocument["animations"]>[number];
const withAnims = (...animations: Anim[]) => makeDoc({ animations });
const beh = (target: string, behavior: string, start: number, duration: number, params: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Anim =>
  ({ id: `b_${behavior}_${target}_${start}`, kind: "behavior", target, behavior, start, duration, params, ...extra }) as Anim;
const closeVec = (a: number[], b: number[], digits = 5) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

describe("pistes de keyframes", () => {
  const doc = withAnims({
    id: "k",
    kind: "keyframes",
    target: "cube",
    property: "transform.position.x",
    keyframes: [
      { t: 1, value: 0, ease: "linear" },
      { t: 3, value: 10, ease: "hold" },
      { t: 5, value: 20 },
    ],
  });
  const x = (t: number) => evaluate(doc, t).byId.cube!.position[0];

  it("avant la 1re clé et après la dernière : valeur constante", () => {
    expect(x(0)).toBe(0);
    expect(x(9)).toBe(20);
  });
  it("interpolation linéaire", () => expect(x(2)).toBeCloseTo(5, 9));
  it("hold : garde la valeur jusqu'à la clé suivante", () => {
    expect(x(4.99)).toBe(10);
    expect(x(5)).toBe(20);
  });
  it("une piste de composante ne touche pas les autres axes", () => {
    const p = evaluate(doc, 2).byId.cube!.position;
    expect([p[1], p[2]]).toEqual([0, 0]);
  });

  it("couleur interpolée en espace linéaire", () => {
    const d = withAnims({ id: "c", kind: "keyframes", target: "m", property: "base_color", keyframes: [
      { t: 0, value: "#000000", ease: "linear" }, { t: 2, value: "#ffffff" },
    ] });
    closeVec(evaluate(d, 1).materials.m!.base_color, [0.5, 0.5, 0.5]);
  });

  it("vecteur complet et propriétés de caméra", () => {
    const d = withAnims(
      { id: "p", kind: "keyframes", target: "cube", property: "transform.scale", keyframes: [{ t: 0, value: [1, 1, 1], ease: "linear" }, { t: 2, value: [3, 1, 1] }] },
      { id: "f", kind: "keyframes", target: "cam", property: "fov", keyframes: [{ t: 0, value: 40, ease: "linear" }, { t: 2, value: 20 }] },
    );
    const s = evaluate(d, 1);
    closeVec(s.byId.cube!.scale, [2, 1, 1]);
    expect(s.byId.cam!.props.fov).toBeCloseTo(30, 9);
  });
});

describe("enter / exit", () => {
  it("rise : caché et décalé avant le départ, en place à la fin", () => {
    const d = withAnims(beh("cube", "enter", 1, 1, { style: "rise", distance: 2 }));
    const before = evaluate(d, 0.5).byId.cube!;
    expect(before.opacity).toBe(0);
    expect(before.position[1]).toBeCloseTo(-2, 9);
    const after = evaluate(d, 3).byId.cube!;
    expect(after.opacity).toBe(1);
    expect(after.position[1]).toBeCloseTo(0, 9);
  });

  it.each([["slide_left", [1, 0, 0]], ["slide_right", [-1, 0, 0]], ["drop", [0, 1, 0]]])("%s part du bon côté", (style, dir) => {
    const p = evaluate(withAnims(beh("cube", "enter", 0, 1, { style, distance: 1 })), 0).byId.cube!.position;
    closeVec(p, dir as number[]);
  });

  it("scale_up et pop partent d'une échelle réduite", () => {
    expect(evaluate(withAnims(beh("cube", "enter", 0, 1, { style: "scale_up" })), 0).byId.cube!.scale[0]).toBe(0);
    expect(evaluate(withAnims(beh("cube", "enter", 0, 1, { style: "pop" })), 0).byId.cube!.scale[0]).toBeCloseTo(0.4, 9);
  });

  it("pop dépasse l'échelle 1 avant de se poser (rebond)", () => {
    const d = withAnims(beh("cube", "enter", 0, 1, { style: "pop" }));
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => evaluate(d, i / 50).byId.cube!.scale[0]));
    expect(peak).toBeGreaterThan(1.02);
    expect(evaluate(d, 1).byId.cube!.scale[0]).toBeCloseTo(1, 9);
  });

  it("exit : visible avant, invisible et décalé après", () => {
    const d = withAnims(beh("cube", "exit", 2, 1, { style: "rise", distance: 1 }));
    expect(evaluate(d, 1).byId.cube!.opacity).toBe(1);
    const end = evaluate(d, 4).byId.cube!;
    expect(end.opacity).toBe(0);
    expect(end.position[1]).toBeCloseTo(1, 9);
  });

  it("enter puis exit sur le même objet se composent", () => {
    const d = withAnims(beh("cube", "enter", 0, 1, { style: "fade" }), beh("cube", "exit", 5, 1, { style: "fade" }));
    expect(evaluate(d, 0).byId.cube!.opacity).toBe(0);
    expect(evaluate(d, 3).byId.cube!.opacity).toBe(1);
    expect(evaluate(d, 7).byId.cube!.opacity).toBe(0);
  });
});

describe("découpage lettre / mot / ligne", () => {
  // "AB CD\nEF" : 6 lettres, 3 mots, 2 lignes
  const startTimes = (split: string, order: string, stagger = 1) => {
    const d = withAnims(beh("txt", "enter", 0, 0.5, { style: "fade", ease: "linear" }, { split, stagger, order }));
    const ev = createEvaluator(d);
    return ev.evaluate(0).byId.txt!.glyphs!.map((_, i) => {
      for (let t = 0; t <= 10; t += 0.25) if (ev.evaluate(t).byId.txt!.glyphs![i]!.opacity > 0) return t - 0.25;
      return -1;
    });
  };

  it("char / forward : chaque lettre démarre 1 s après la précédente", () => expect(startTimes("char", "forward")).toEqual([0, 1, 2, 3, 4, 5]));
  it("char / reverse", () => expect(startTimes("char", "reverse")).toEqual([5, 4, 3, 2, 1, 0]));
  it("char / center_out : le centre d'abord", () => expect(startTimes("char", "center_out")).toEqual([2, 1, 0, 0, 1, 2]));
  it("word : les lettres d'un même mot partent ensemble", () => expect(startTimes("word", "forward")).toEqual([0, 0, 1, 1, 2, 2]));
  it("line", () => expect(startTimes("line", "forward")).toEqual([0, 0, 0, 0, 1, 1]));

  it("random : permutation déterministe qui dépend de la graine", () => {
    const a = startTimes("char", "random");
    expect([...a].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(startTimes("char", "random")).toEqual(a);
  });

  it("le nœud texte lui-même n'est pas modifié par un behavior découpé", () => {
    const d = withAnims(beh("txt", "enter", 0, 1, { style: "rise" }, { split: "char", stagger: 0.1 }));
    const s = evaluate(d, 0).byId.txt!;
    expect(s.opacity).toBe(1);
    expect(s.glyphs![0]!.opacity).toBe(0);
    expect(s.glyphs![0]!.offset[1]).toBeLessThan(0);
  });
});

describe("mouvements continus", () => {
  it("spin : un quart de tour autour de Y", () => {
    const d = withAnims(beh("cube", "spin", 0, 1, { axis: "y", revolutions: 0.25, ease: "linear" }));
    closeVec(rotateVec(evaluate(d, 1).byId.cube!.quaternion, [1, 0, 0]), [0, 0, -1]);
  });

  it.each(["float", "pulse", "wiggle"])("%s : sans effet hors de sa fenêtre et aux bornes, actif au milieu", (b) => {
    const d = withAnims(beh("cube", b, 2, 4, b === "wiggle" ? { amplitude: 1 } : {}));
    const rest = evaluate(makeDoc(), 0).byId.cube!;
    for (const t of [0, 2, 6, 8]) {
      const s = evaluate(d, t).byId.cube!;
      closeVec(s.position, rest.position, 9);
      closeVec(s.scale, rest.scale, 9);
    }
    const mid = Array.from({ length: 30 }, (_, i) => evaluate(d, 2.5 + i * 0.1).byId.cube!);
    const moved = mid.some((s) => Math.abs(s.position[1]) > 1e-3 || Math.abs(s.scale[0] - 1) > 1e-3 || Math.abs(s.position[0]) > 1e-3);
    expect(moved).toBe(true);
  });

  it("wiggle : deux behaviors d'identifiants différents ne bougent pas pareil", () => {
    const a = withAnims({ ...beh("cube", "wiggle", 0, 10, { amplitude: 1 }), id: "w1" } as Anim);
    const b = withAnims({ ...beh("cube", "wiggle", 0, 10, { amplitude: 1 }), id: "w2" } as Anim);
    expect(evaluate(a, 3.3).byId.cube!.position).not.toEqual(evaluate(b, 3.3).byId.cube!.position);
  });
});

describe("caméra : orbit, look_at, dolly", () => {
  it("orbit de 90° autour de Y : (0,0,10) → (10,0,0), en regardant toujours le centre", () => {
    const s = evaluate(withAnims(beh("cam", "orbit", 0, 1, { degrees: 90, ease: "linear" })), 1).byId.cam!;
    closeVec(s.position, [10, 0, 0]);
    closeVec(rotateVec(s.quaternion, [0, 0, -1]), [-1, 0, 0]);
  });

  it("look_at : la caméra vise la cible", () => {
    const d = makeDoc({
      nodes: [
        { id: "cam", type: "camera", transform: { position: [5, 5, 5] } },
        { id: "cube", type: "shape", shape: { kind: "box" }, material: "m", transform: { position: [1, 0, -2] } },
      ],
      assets: [],
      animations: [beh("cam", "look_at", 0, 10, { node: "cube" })],
    });
    const s = evaluate(d, 1).byId.cam!;
    const dir: Vec3 = [1 - 5, 0 - 5, -2 - 5];
    const n = Math.hypot(...dir);
    closeVec(rotateVec(s.quaternion, [0, 0, -1]), dir.map((v) => v / n));
  });

  it("look_at dans une hiérarchie tournée", () => {
    const d = makeDoc({
      nodes: [
        { id: "rig", type: "group", transform: { rotation: [0, 90, 0] } },
        { id: "cam", type: "camera", parent: "rig", transform: { position: [0, 0, 10] } },
        { id: "cube", type: "shape", shape: { kind: "box" }, material: "m", transform: { position: [0, 3, 0] } },
      ],
      assets: [],
      animations: [beh("cam", "look_at", 0, 10, { node: "cube" })],
    });
    const s = evaluate(d, 0).byId.cam!;
    const m = s.worldMatrix;
    const camPos = [m[12]!, m[13]!, m[14]!];
    closeVec(camPos, [10, 0, 0]);
    // axe −Z monde de la caméra = −(3e colonne normalisée)
    const fwd = [-m[8]!, -m[9]!, -m[10]!];
    const dir = [0 - 10, 3, 0];
    const n = Math.hypot(...dir);
    closeVec(fwd, dir.map((v) => v / n));
  });

  it("dolly : avance le long de l'axe de visée", () => {
    const s = evaluate(withAnims(beh("cam", "dolly", 0, 1, { distance: 4, ease: "linear" })), 1).byId.cam!;
    closeVec(s.position, [0, 0, 6]);
  });
});

describe("hiérarchie", () => {
  it("opacité et visibilité cumulées", () => {
    const d = makeDoc({
      nodes: [
        { id: "g", type: "group", opacity: 0.5, visible: false },
        { id: "cube", type: "shape", parent: "g", opacity: 0.5, shape: { kind: "box" }, material: "m" },
      ],
      assets: [],
    });
    const c = evaluate(d, 0).byId.cube!;
    expect(c.worldOpacity).toBeCloseTo(0.25, 9);
    expect(c.worldVisible).toBe(false);
  });

  it("l'enfant suit la transformation du parent (même déclaré avant lui)", () => {
    const d = makeDoc({
      nodes: [
        { id: "cube", type: "shape", parent: "g", shape: { kind: "box" }, material: "m", transform: { position: [1, 0, 0] } },
        { id: "g", type: "group", transform: { position: [0, 5, 0], rotation: [0, 0, 90] } },
      ],
      assets: [],
    });
    const s = evaluate(d, 0);
    expect(s.nodes.map((n) => n.id)).toEqual(["g", "cube"]);
    const m = s.byId.cube!.worldMatrix;
    closeVec([m[12]!, m[13]!, m[14]!], [0, 6, 0]);
  });
});

describe("pureté et déterminisme", () => {
  it("l'ordre des évaluations n'influence pas le résultat", () => {
    const d = withAnims(beh("cube", "wiggle", 0, 10, { amplitude: 1 }), beh("txt", "enter", 0, 1, {}, { split: "char", stagger: 0.2, order: "random" }));
    const ev = createEvaluator(d);
    const a = JSON.stringify(ev.evaluate(3.2));
    ev.evaluate(7.1);
    ev.evaluate(0);
    expect(JSON.stringify(ev.evaluate(3.2))).toBe(a);
    expect(JSON.stringify(evaluate(d, 3.2))).toBe(a);
  });

  it("le document n'est jamais modifié", () => {
    const d = withAnims(beh("cam", "orbit", 0, 2, { degrees: 90 }), beh("cube", "enter", 0, 1, {}));
    const before = JSON.stringify(d);
    evaluate(d, 1);
    expect(JSON.stringify(d)).toBe(before);
  });

  it("changer la graine change l'aléatoire", () => {
    const d1 = withAnims(beh("cube", "wiggle", 0, 10, { amplitude: 1 }));
    const d2 = { ...d1, settings: { ...d1.settings, seed: 2 } };
    expect(evaluate(d1, 3).byId.cube!.position).not.toEqual(evaluate(d2, 3).byId.cube!.position);
  });

  it("un behavior inconnu est refusé explicitement", () => {
    expect(() => createEvaluator(withAnims(beh("cube", "explode", 0, 1)))).toThrow(UnsupportedFeatureError);
  });
});

describe("scènes de référence", () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/scenes/valid");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  it.each(files)("%s : 60 instants évalués, toutes les valeurs finies", (file) => {
    const doc = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as SceneDocument;
    const ev = createEvaluator(doc);
    for (let i = 0; i <= 60; i++) {
      const s = ev.evaluate((doc.settings.duration * i) / 60);
      const check = (v: unknown): void => {
        if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
        else if (Array.isArray(v)) v.forEach(check);
        else if (v && typeof v === "object") Object.values(v).forEach(check);
      };
      check(s.nodes);
      check(s.materials);
      for (const n of s.nodes) expect(Math.hypot(...n.quaternion)).toBeCloseTo(1, 6);
    }
  });
});

describe("wiggle : pas de retour synchronisé au repos", () => {
  it("aux multiples de 1/fréquence, la position n'est pas nulle", () => {
    const d = withAnims(beh("cube", "wiggle", 0, 10, { amplitude: 1, frequency: 2 }));
    for (const t of [1, 2, 3, 4]) expect(Math.hypot(...evaluate(d, t).byId.cube!.position)).toBeGreaterThan(1e-3);
  });
});
