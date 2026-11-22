// Génère src/generated/msd.ts depuis generated/msd.schema.json (lui-même exporté
// depuis les modèles Pydantic : docs/adr/0002). Avec --check, échoue si le fichier
// versionné n'est pas à jour au lieu de l'écrire.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(root, "generated/msd.schema.json");
const outPath = resolve(root, "src/generated/msd.ts");
const check = process.argv.includes("--check");

const schema = JSON.parse(await readFile(schemaPath, "utf8"));
// `discriminator` est une annotation OpenAPI : inutile pour les types.
const ts = await compile(schema, "SceneDocument", {
  additionalProperties: false,
  bannerComment:
    "/* eslint-disable */\n/**\n * FICHIER GÉNÉRÉ — ne pas modifier à la main.\n * Source : services/api/manipulator_api/schema/models.py\n * Régénérer : pnpm schema:export && pnpm schema:types\n */",
  style: { singleQuote: false, semi: true, printWidth: 100 },
  unreachableDefinitions: true,
});

let current = null;
try {
  current = await readFile(outPath, "utf8");
} catch {}

if (check) {
  if (current !== ts) {
    console.error("src/generated/msd.ts n'est pas à jour. Lancez : pnpm schema:types");
    process.exit(1);
  }
  console.log("Types TypeScript à jour.");
} else if (current !== ts) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, ts, "utf8");
  console.log("Écrit : src/generated/msd.ts");
} else {
  console.log("Types TypeScript déjà à jour.");
}
