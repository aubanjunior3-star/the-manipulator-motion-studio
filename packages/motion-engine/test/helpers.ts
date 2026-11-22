import type { SceneDocument } from "@manipulator/scene-schema";

/** Petit document de test : un texte, un cube, une caméra. */
export function makeDoc(overrides: Partial<SceneDocument> = {}): SceneDocument {
  return {
    msd_version: "0.1.0",
    id: "test_doc",
    meta: { title: "test" },
    settings: { fps: 30, width: 320, height: 180, duration: 10, seed: 1 },
    active_camera: "cam",
    assets: [{ id: "f", kind: "font", uri: "builtin:fonts/display-bold" }],
    materials: [{ id: "m", base_color: "#000000" }],
    nodes: [
      { id: "cam", type: "camera", transform: { position: [0, 0, 10] } },
      { id: "cube", type: "shape", shape: { kind: "box" }, material: "m" },
      { id: "txt", type: "text", content: "AB CD\nEF", font: "f", material: "m" },
    ],
    animations: [],
    ...overrides,
  };
}

export const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;
