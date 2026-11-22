/**
 * @manipulator/scene-schema — côté TypeScript du schéma MSD.
 *
 * - Types : générés depuis le JSON Schema (lui-même exporté des modèles Pydantic).
 * - Registre : propriétés animables, behaviors, easings (même source Python).
 * - validateStructure() : validation *structurelle* (JSON Schema) pour l'interface.
 *
 * La validation *sémantique* (références, temps, paramètres de behaviors) fait
 * autorité côté Python (services/api/manipulator_api/schema/validate.py) ; voir
 * docs/adr/0002 pour la raison et le plan de portage.
 */
import { createRequire } from "node:module";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

export type * from "./generated/msd.js";
import type { SceneDocument } from "./generated/msd.js";

const require = createRequire(import.meta.url);
export const msdSchema: Record<string, unknown> = require("../generated/msd.schema.json");
export const registry: MsdRegistry = require("../generated/registry.json");

export const MSD_VERSION = "0.1.0" as const;

export type ValueType = "scalar" | "vec3" | "color";

export type BehaviorParamSpec =
  | { type: "number"; min: number; max: number; default: number }
  | { type: "enum"; values: string[]; default: string }
  | { type: "vec3"; default: [number, number, number] }
  | { type: "bool"; default: boolean }
  | { type: "node_ref"; required?: boolean };

export interface BehaviorSpec {
  description: string;
  targets: string[];
  params: Record<string, BehaviorParamSpec>;
}

export interface MsdRegistry {
  msd_version: string;
  ease_presets: string[];
  animatable: Record<string, Record<string, ValueType>>;
  behaviors: Record<string, BehaviorSpec>;
}

export interface StructureIssue {
  code: string;
  path: string;
  message: string;
}

export type StructureResult =
  | { ok: true; document: SceneDocument; issues: [] }
  | { ok: false; issues: StructureIssue[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
// Annotation OpenAPI émise par Pydantic pour les unions discriminées : sans effet de validation
// (le `oneOf` + les `const` de chaque variante suffisent).
ajv.addKeyword({ keyword: "discriminator", schemaType: "object" });
const compiled = ajv.compile<SceneDocument>(msdSchema);

export function validateStructure(data: unknown): StructureResult {
  if (compiled(data)) {
    return { ok: true, document: data, issues: [] };
  }
  const issues = (compiled.errors ?? []).map((e: ErrorObject) => ({
    code: `schema.${e.keyword}`,
    path: e.instancePath || "/",
    message: e.message ?? "invalide",
  }));
  return { ok: false, issues };
}
