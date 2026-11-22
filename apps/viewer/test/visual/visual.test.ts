/**
 * Tests visuels : rendu réel des scènes de référence dans Chromium (WebGL, SwiftShader en CI).
 *
 * - Références : tests/golden/<scène>@<fraction>.png. Écart toléré : 0,1 % des pixels
 *   (micro-écarts entre machines). Mise à jour volontaire : UPDATE_GOLDEN=1 pnpm test:visual
 * - Déterminisme : un même instant rendu deux fois, dans des ordres différents, donne
 *   exactement les mêmes octets.
 * - Aucune erreur dans la page, aucun avertissement inattendu.
 *
 * Exécutés en CI sous Linux uniquement : le rendu logiciel diffère d'un système à l'autre.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error module JS sans types (scripts partagés avec l'outil en ligne de commande)
import { startHarness } from "../../scripts/harness.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const goldenDir = resolve(repo, "tests/golden");
const sceneDir = resolve(repo, "tests/fixtures/scenes/valid");
const update = process.env.UPDATE_GOLDEN === "1";
const FRACTIONS = [0.15, 0.6];
const MAX_DIFF_RATIO = 0.001;
const EXPECTED_WARNINGS: Record<string, string[]> = {
  "08-empty": ["Aucune caméra active : caméra par défaut (0, 0, 10)."],
};

const scenes = readdirSync(sceneDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(".json", ""));
const duration = (name: string): number => JSON.parse(readFileSync(resolve(sceneDir, `${name}.json`), "utf8")).settings.duration;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let h: any;
const timings: string[] = [];

beforeAll(async () => {
  h = await startHarness({ width: 320 });
  mkdirSync(goldenDir, { recursive: true });
}, 120_000);

afterAll(async () => {
  if (timings.length) console.log(`GPU : ${h?.gpu}\n` + timings.join("\n"));
  await h?.close();
});

describe.each(scenes)("%s", (name) => {
  it("se charge sans erreur ni avertissement inattendu", async () => {
    const warnings: string[] = await h.load(name);
    expect(warnings).toEqual(EXPECTED_WARNINGS[name] ?? []);
    expect(h.errors).toEqual([]);
  }, 60_000);

  it.each(FRACTIONS)("instant %s × durée : conforme à l'image de référence", async (f) => {
    const t0 = performance.now();
    const png: Buffer = await h.frame(duration(name) * f);
    timings.push(`${name}@${f} : ${(performance.now() - t0).toFixed(0)} ms`);
    const file = resolve(goldenDir, `${name}@${f}.png`);
    if (update || !existsSync(file)) {
      if (!update) throw new Error(`Référence absente : ${file}. Lancez UPDATE_GOLDEN=1 pnpm test:visual.`);
      writeFileSync(file, png);
      return;
    }
    const a = PNG.sync.read(png);
    const b = PNG.sync.read(readFileSync(file));
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    const diff = new PNG({ width: a.width, height: a.height });
    const bad = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    const ratio = bad / (a.width * a.height);
    if (ratio > MAX_DIFF_RATIO) {
      const out = resolve(repo, "tests/golden/_diff");
      mkdirSync(out, { recursive: true });
      writeFileSync(resolve(out, `${name}@${f}.actual.png`), png);
      writeFileSync(resolve(out, `${name}@${f}.diff.png`), PNG.sync.write(diff));
    }
    expect(ratio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
  }, 60_000);

  it("déterminisme : même instant ⇒ mêmes octets, quel que soit l'ordre des rendus", async () => {
    const d = duration(name);
    const first = sha(await h.frame(d * 0.6));
    await h.frame(d * 0.9);
    await h.frame(0);
    expect(sha(await h.frame(d * 0.6))).toBe(first);
  }, 60_000);
});
