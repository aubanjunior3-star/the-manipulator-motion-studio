// Rend des images PNG d'une ou plusieurs scènes de référence.
// Usage : node scripts/render-frames.mjs <dossier-sortie> [scène…] [--at 0.2,0.6] [--width 640]
//   --at : instants en fraction de la durée (défaut 0.6)
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startHarness } from "./harness.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const at = opt("--at", "0.6").split(",").map(Number);
const width = Number(opt("--width", "640"));
const [outDir, ...only] = args;
if (!outDir) {
  console.error("Usage : node scripts/render-frames.mjs <dossier-sortie> [scène…] [--at 0.2,0.6] [--width 640]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const h = await startHarness({ width });
console.log(`GPU : ${h.gpu ?? "WebGL2 indisponible"}`);
let failed = false;
try {
  const all = await h.scenes();
  for (const name of only.length ? only : all) {
    const warnings = await h.load(name);
    const doc = (await import(resolve(import.meta.dirname, "../../../tests/fixtures/scenes/valid", `${name}.json`), { with: { type: "json" } })).default;
    for (const f of at) {
      const t0 = performance.now();
      const png = await h.frame(doc.settings.duration * f);
      const file = resolve(outDir, `${name}@${f}.png`);
      writeFileSync(file, png);
      console.log(`${name} t=${(doc.settings.duration * f).toFixed(2)}s  ${(performance.now() - t0).toFixed(0)} ms${warnings.length ? "  ⚠ " + warnings.join(" | ") : ""}`);
    }
  }
  if (h.errors.length) {
    failed = true;
    console.error("Erreurs dans la page :", h.errors);
  }
} finally {
  await h.close();
}
process.exit(failed ? 1 : 0);
