/**
 * Contrat Python ⇄ TypeScript : les mêmes scènes de référence (tests/fixtures/scenes)
 * doivent recevoir le même verdict *structurel* des deux côtés.
 *  - scènes valides                 → acceptées par Ajv
 *  - invalides de couche "schema"   → rejetées par Ajv (comme par Pydantic)
 *  - invalides de couche "semantic" → acceptées par Ajv (seule la validation sémantique
 *    Python les rejette) : prouve que les deux couches sont bien séparées.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MSD_VERSION, msdSchema, registry, validateStructure } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "../../../tests/fixtures/scenes");
const read = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));

const validFiles = readdirSync(resolve(fixtures, "valid")).filter((f) => f.endsWith(".json"));
const expectations = read(resolve(fixtures, "invalid/expectations.json")) as Record<
  string,
  { layer: "schema" | "semantic"; codes: string[] }
>;

describe("scènes valides", () => {
  it("il y en a au moins 10", () => expect(validFiles.length).toBeGreaterThanOrEqual(10));

  it.each(validFiles)("%s est acceptée", (file) => {
    const result = validateStructure(read(resolve(fixtures, "valid", file)));
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("scènes invalides", () => {
  it.each(Object.entries(expectations))("%s", (file, { layer }) => {
    const result = validateStructure(read(resolve(fixtures, "invalid", file)));
    if (layer === "schema") {
      expect(result.ok).toBe(false);
      for (const issue of result.issues) expect(issue.path.startsWith("/")).toBe(true);
    } else {
      expect(result.issues).toEqual([]);
    }
  });
});

describe("cas structurels", () => {
  const base = () => read(resolve(fixtures, "valid/01-title-rise-3d.json")) as any;

  it("rejette un nombre écrit en texte (même règle stricte que Pydantic)", () => {
    const doc = base();
    doc.materials[0].roughness = "0.5";
    const r = validateStructure(doc);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path === "/materials/0/roughness")).toBe(true);
  });

  it("rejette une entrée qui n'est pas un objet", () => {
    for (const data of [null, [], "scene", 42]) expect(validateStructure(data).ok).toBe(false);
  });
});

describe("registre et schéma générés", () => {
  it("versions cohérentes", () => {
    expect(registry.msd_version).toBe(MSD_VERSION);
    const props = (msdSchema as any).properties;
    expect(props.msd_version.const).toBe(MSD_VERSION);
  });

  it("chaque behavior a une description, des cibles et des valeurs par défaut valides", () => {
    for (const [name, spec] of Object.entries(registry.behaviors)) {
      expect(spec.description, name).toBeTruthy();
      expect(spec.targets.length, name).toBeGreaterThan(0);
      for (const p of Object.values(spec.params)) {
        if (p.type === "number") expect(p.default >= p.min && p.default <= p.max, name).toBe(true);
        if (p.type === "enum") expect(p.values, name).toContain(p.default);
      }
    }
  });

  it("les easings du registre sont ceux du schéma", () => {
    const schemaEases = (msdSchema as any).$defs.Keyframe.properties.ease.anyOf[0].enum;
    expect(registry.ease_presets).toEqual(schemaEases);
  });
});
