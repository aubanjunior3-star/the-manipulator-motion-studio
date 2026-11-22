// Exporte des scènes de référence en vidéo depuis la ligne de commande (même code que le bouton
// « Exporter » de la visionneuse, exécuté dans Chromium headless).
// Usage : node scripts/export.mjs <dossier-sortie> [scène…] [--format mp4|webm] [--width 640]
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
const format = opt("--format", "mp4");
const width = opt("--width", undefined);
const [outDir, ...only] = args;
if (!outDir) {
  console.error("Usage : node scripts/export.mjs <dossier-sortie> [scène…] [--format mp4|webm] [--width 640]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const h = await startHarness();
try {
  for (const name of only.length ? only : await h.scenes()) {
    const r = await h.page.evaluate(([n, f, w]) => window.__viewer.exportVideo(n, f, w), [name, format, width ? Number(width) : undefined]);
    const file = resolve(outDir, `${name}.${format}`);
    writeFileSync(file, Buffer.from(r.base64, "base64"));
    console.log(`${file}  ${r.width}×${r.height} · ${r.frames} images · ${r.elapsed.toFixed(1)} s${r.warnings.length ? "  ⚠ " + r.warnings.join(" | ") : ""}`);
  }
} finally {
  await h.close();
}
