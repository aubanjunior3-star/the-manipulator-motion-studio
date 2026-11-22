/**
 * Tests de l'export vidéo (rendu réel dans Chromium, analyse du fichier avec ffprobe/ffmpeg).
 *
 * - Conformité du fichier : codec, profil, dimensions, cadence, nombre exact d'images, durée.
 * - Fidélité : des images décodées de la vidéo sont comparées aux images rendues directement au
 *   même instant (PSNR). La meilleure correspondance doit être l'instant attendu, pas un voisin :
 *   prouve l'absence de décalage temporel.
 * - Mémoire : export d'une scène de 60 s, mémoire JavaScript échantillonnée pendant l'export.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error module JS sans types
import { startHarness } from "../../scripts/harness.mjs";

const WIDTH = 640;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let h: any;
const dir = mkdtempSync(join(tmpdir(), "manipulator-export-"));

beforeAll(async () => {
  h = await startHarness({ width: WIDTH });
}, 120_000);
afterAll(async () => h?.close());

async function exportScene(name: string, format: "mp4" | "webm", width = WIDTH, duration?: number) {
  const r = await h.page.evaluate(
    ([n, f, w, d]: [string, string, number, number | undefined]) => window.__viewer.exportVideo(n, f as "mp4", w, d),
    [name, format, width, duration],
  );
  const file = join(dir, `${name}-${width}.${format}`);
  writeFileSync(file, Buffer.from(r.base64, "base64"));
  return { ...r, file };
}

function probe(file: string): Record<string, string> {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,profile,width,height,r_frame_rate,nb_read_frames:format=duration",
    "-of", "default=nw=1", file,
  ]).toString();
  return Object.fromEntries(out.trim().split("\n").map((l) => l.split("=") as [string, string]));
}

/** Décode l'image n de la vidéo en RGB. */
function decodeFrame(file: string, n: number): PNG {
  const png = join(dir, `f${n}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", `select=eq(n\\,${n})`, "-frames:v", "1", png]);
  return PNG.sync.read(readFileSync(png));
}

function psnr(a: PNG, b: PNG): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let se = 0, count = 0;
  for (let i = 0; i < a.data.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const d = a.data[i + c]! - b.data[i + c]!;
      se += d * d;
      count++;
    }
  const mse = se / count;
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

const rendered = async (t: number) => PNG.sync.read(await h.frame(t));

describe("export MP4 (H.264)", () => {
  let r: Awaited<ReturnType<typeof exportScene>>;
  beforeAll(async () => {
    await h.load("02-logo-orbit");
    r = await exportScene("02-logo-orbit", "mp4");
  }, 180_000);

  it("fichier conforme : H.264 High, 640×360, 30 i/s, 180 images, 6,000 s", () => {
    const p = probe(r.file);
    expect(p.codec_name).toBe("h264");
    expect(p.profile).toBe("High");
    expect([p.width, p.height]).toEqual(["640", "360"]);
    expect(p.r_frame_rate).toBe("30/1");
    expect(p.nb_read_frames).toBe("180");
    expect(Number(p.duration)).toBeCloseTo(6, 2);
    expect(r.warnings).toEqual([]);
  });

  it.each([0, 45, 107, 179])("image %i : identique au rendu direct du même instant, sans décalage", async (n) => {
    const video = decodeFrame(r.file, n);
    const exact = psnr(video, await rendered(n / 30));
    expect(exact).toBeGreaterThan(32);
    // Les instants voisins (±2 images) doivent correspondre moins bien : pas de décalage temporel.
    for (const k of [n - 2, n + 2].filter((k) => k >= 0 && k < 180)) {
      expect(psnr(video, await rendered(k / 30))).toBeLessThan(exact);
    }
  }, 60_000);
});

describe("export WebM (VP9)", () => {
  it("fichier conforme et fidèle", async () => {
    await h.load("03-kinetic-type-2d");
    const r = await exportScene("03-kinetic-type-2d", "webm");
    const p = probe(r.file);
    expect(p.codec_name).toBe("vp9");
    expect([p.width, p.height]).toEqual(["640", "360"]);
    expect(p.nb_read_frames).toBe("120");
    expect(psnr(decodeFrame(r.file, 60), await rendered(2))).toBeGreaterThan(32);
  }, 180_000);
});

describe("format vertical 9:16, 60 i/s", () => {
  it("dimensions et cadence respectées", async () => {
    const r = await exportScene("10-vertical-social", "mp4", 360);
    const p = probe(r.file);
    expect([p.width, p.height]).toEqual(["360", "640"]);
    expect(p.r_frame_rate).toBe("60/1");
    expect(p.nb_read_frames).toBe("180");
  }, 180_000);
});

describe("mémoire", () => {
  it("export de 60 s (1 800 images) : la mémoire JavaScript reste stable", async () => {
    const cdp = await h.page.context().newCDPSession(h.page);
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = async () => ((await cdp.send("Runtime.getHeapUsage")) as { usedSize: number }).usedSize / 1e6;
    const before = await heap();
    const samples: number[] = [];
    let done = false;
    const sampler = (async () => {
      while (!done) {
        samples.push(await heap());
        await new Promise((res) => setTimeout(res, 1000));
      }
    })();
    const r = await exportScene("05-abstract-float", "mp4", 320, 60);
    done = true;
    await sampler;
    await cdp.send("HeapProfiler.collectGarbage");
    const after = await heap();
    const peak = Math.max(...samples);
    console.log(`Mémoire JS : avant ${before.toFixed(0)} Mo, pic ${peak.toFixed(0)} Mo, après ${after.toFixed(0)} Mo · ${r.frames} images en ${r.elapsed.toFixed(1)} s`);
    expect(r.frames).toBe(1800);
    expect(probe(r.file).nb_read_frames).toBe("1800");
    // Le pic inclut le fichier vidéo en mémoire (quelques Mo) : pas d'accumulation des images.
    expect(peak - before).toBeLessThan(150);
    expect(after - before).toBeLessThan(30);
  }, 600_000);
});

mkdirSync(dir, { recursive: true });

describe("interface : bouton Exporter (parcours utilisateur)", () => {
  it("ouvrir, choisir l'aperçu rapide, exporter, télécharger un MP4 valide", async () => {
    const origin = new URL(h.page.url()).origin;
    const page = await h.page.context().browser().newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${origin}/?scene=06-lower-third`);
    await page.waitForFunction(() => document.querySelector<HTMLSelectElement>("#scene-select")?.value === "06-lower-third");
    await page.click("#export-open");
    await expect.poll(() => page.isVisible("#export-dialog")).toBe(true);
    // 3e option : 25 % de la taille du projet (480×270)
    await page.selectOption("#export-size", { index: 2 });
    expect(await page.textContent("#export-info")).toContain("480×270");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.click("#export-start")]);
    expect(download.suggestedFilename()).toBe("lower_third.mp4");
    const file = join(dir, "ui-download.mp4");
    await download.saveAs(file);
    const p = probe(file);
    expect([p.codec_name, p.width, p.height, p.nb_read_frames]).toEqual(["h264", "480", "270", "180"]);
    expect(await page.textContent("#export-status")).toContain("Terminé");
    expect(await page.isVisible("#export-download")).toBe(true);
    await page.close();
  }, 180_000);

  it("Annuler interrompt l'export proprement", async () => {
    const origin = new URL(h.page.url()).origin;
    const page = await h.page.context().browser().newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${origin}/?scene=05-abstract-float`);
    await page.waitForFunction(() => document.querySelector<HTMLSelectElement>("#scene-select")?.value === "05-abstract-float");
    await page.click("#export-open");
    await page.click("#export-start");
    await page.waitForFunction(() => /Image \d+/.test(document.querySelector("#export-status")?.textContent ?? ""));
    await page.click("#export-cancel");
    await page.waitForFunction(() => document.querySelector("#export-status")?.textContent === "Export annulé.");
    expect(await page.isEnabled("#export-start")).toBe(true);
    expect(await page.isVisible("#export-download")).toBe(false);
    await page.close();
  }, 180_000);
});
