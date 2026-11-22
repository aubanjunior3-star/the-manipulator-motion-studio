import "./style.css";
import { SceneRenderer } from "@manipulator/render-three";
import { type SceneDocument, validateStructure } from "@manipulator/scene-schema";
import { exportVideo, type VideoFormat } from "@manipulator/export";
import { setupExportPanel } from "./export-panel";
import { resolveAsset } from "./resolver";
import { AdaptiveResolution, advance, formatTime, frameAt, frameCount, timeOfFrame } from "./timing";

// Scènes de référence (tests/fixtures/scenes/valid), embarquées à la compilation.
const fixtures = import.meta.glob<SceneDocument>("../../../tests/fixtures/scenes/valid/*.json", { eager: true, import: "default" });
const scenes = new Map(Object.entries(fixtures).map(([path, doc]) => [path.split("/").pop()!.replace(".json", ""), doc]));

const params = new URLSearchParams(location.search);
const testMode = params.has("test");
if (testMode) document.body.classList.add("test");

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas");
const stage = $("stage");
const select = $<HTMLSelectElement>("scene-select");
const fileInput = $<HTMLInputElement>("file-input");
const playBtn = $<HTMLButtonElement>("play");
const scrub = $<HTMLInputElement>("scrub");
const timeEl = $("time");
const statsEl = $("stats");
const overlay = $("overlay");
const issues = $("issues");
const issuesList = $("issues-list");
const adaptiveBox = $<HTMLInputElement>("adaptive");
const loopBox = $<HTMLInputElement>("loop");

const maxRatio = testMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);
let projectBase: string | null = "/project-assets/";
const renderer = new SceneRenderer({
  canvas,
  resolveAsset: (uri) => resolveAsset(uri, projectBase),
  pixelRatio: maxRatio,
  preserveDrawingBuffer: testMode,
});
const adaptive = new AdaptiveResolution(maxRatio);

let doc: SceneDocument | null = null;
let t = 0;
let playing = false;
let lastTs = 0;

function fit(): void {
  if (!doc) return;
  const aspect = doc.settings.width! / doc.settings.height!;
  let w: number, h: number;
  if (testMode) {
    w = Number(params.get("w") ?? 480);
    h = Math.round(w / aspect);
  } else {
    const r = stage.getBoundingClientRect();
    const availW = r.width - 48, availH = r.height - 48;
    w = Math.min(availW, availH * aspect);
    h = w / aspect;
  }
  canvas.style.width = `${Math.round(w)}px`;
  canvas.style.height = `${Math.round(h)}px`;
  renderer.setSize(Math.round(w), Math.round(h));
}

function showIssues(list: string[]): void {
  issuesList.replaceChildren(
    ...list.map((msg) => {
      const li = document.createElement("li");
      li.textContent = msg;
      return li;
    }),
  );
  issues.hidden = list.length === 0;
  requestAnimationFrame(fit);
}

function draw(): void {
  if (!doc) return;
  renderer.renderAt(t);
  const fps = doc.settings.fps ?? 30;
  const total = frameCount(doc.settings.duration, fps);
  timeEl.textContent = `${formatTime(t)} / ${formatTime(doc.settings.duration)}`;
  overlay.textContent = `image ${frameAt(t, fps)} / ${total - 1} · ${fps} i/s · ${doc.settings.width}×${doc.settings.height}`;
  scrub.value = String(Math.round((t / doc.settings.duration) * 1000));
}

async function load(next: SceneDocument, base: string | null): Promise<string[]> {
  setPlaying(false);
  projectBase = base;
  const report = await renderer.load(next);
  doc = next;
  t = 0;
  fit();
  draw();
  showIssues(report.warnings);
  return report.warnings;
}

function setPlaying(on: boolean): void {
  playing = on && doc !== null;
  playBtn.classList.toggle("playing", playing);
  playBtn.textContent = playing ? "❚❚" : "▶";
  playBtn.setAttribute("aria-label", playing ? "Pause" : "Lecture");
  adaptive.reset();
  lastTs = performance.now();
  if (!playing && renderer.renderer.getPixelRatio() !== maxRatio) {
    // À l'arrêt : toujours pleine résolution.
    adaptive.ratio = maxRatio;
    renderer.setPixelRatio(maxRatio);
    fit();
    draw();
  }
}

function loop(ts: number): void {
  if (playing && doc) {
    const dt = Math.min(0.25, (ts - lastTs) / 1000);
    const step = advance(t, dt, doc.settings.duration, loopBox.checked);
    t = step.t;
    draw();
    if (adaptive.tick(dt, adaptiveBox.checked)) {
      renderer.setPixelRatio(adaptive.ratio);
      fit();
    }
    statsEl.textContent = `${adaptive.fps ? adaptive.fps.toFixed(0) : "—"} fps · ${Math.round((adaptive.ratio / maxRatio) * 100)} %`;
    if (step.ended) setPlaying(false);
  }
  lastTs = ts;
  requestAnimationFrame(loop);
}

function stepFrames(n: number): void {
  if (!doc) return;
  setPlaying(false);
  const fps = doc.settings.fps ?? 30;
  const f = Math.min(frameCount(doc.settings.duration, fps) - 1, Math.max(0, frameAt(t, fps) + n));
  t = timeOfFrame(f, fps);
  draw();
}

// --- interface ---
for (const name of scenes.keys()) select.add(new Option(name, name));
select.addEventListener("change", () => void load(scenes.get(select.value)!, "/project-assets/"));
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    showIssues([`${file.name} : JSON illisible (${(e as Error).message}).`]);
    return;
  }
  const result = validateStructure(data);
  if (!result.ok) {
    showIssues(result.issues.map((i) => `${file.name} : ${i.path} — ${i.message} (${i.code})`));
    return;
  }
  select.value = "";
  // Fichier ouvert hors projet : les assets « project: » ne sont pas accessibles (avertissement).
  await load(result.document, null);
});
playBtn.addEventListener("click", () => {
  if (doc && !playing && t >= doc.settings.duration) t = 0;
  setPlaying(!playing);
});
$("step-back").addEventListener("click", () => stepFrames(-1));
$("step-fwd").addEventListener("click", () => stepFrames(1));
scrub.addEventListener("input", () => {
  if (!doc) return;
  setPlaying(false);
  const fps = doc.settings.fps ?? 30;
  t = timeOfFrame(frameAt((Number(scrub.value) / 1000) * doc.settings.duration, fps), fps);
  draw();
});
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
  if (e.code === "Space") {
    e.preventDefault();
    playBtn.click();
  } else if (e.code === "ArrowLeft") stepFrames(-1);
  else if (e.code === "ArrowRight") stepFrames(1);
});
new ResizeObserver(() => {
  fit();
  if (!playing) draw();
}).observe(stage);

// --- accès pour les tests automatisés (Playwright) ---
declare global {
  interface Window {
    __viewer: {
      scenes: string[];
      load(name: string): Promise<string[]>;
      renderAt(time: number): void;
      /** Exporte une scène de référence ; renvoie le fichier en base64 et ses caractéristiques. */
      exportVideo(name: string, format: VideoFormat, width?: number, durationOverride?: number): Promise<{
        base64: string;
        frames: number;
        fps: number;
        width: number;
        height: number;
        elapsed: number;
        warnings: string[];
      }>;
    };
  }
}
window.__viewer = {
  scenes: [...scenes.keys()],
  load: (name) => {
    const d = scenes.get(name);
    if (!d) throw new Error(`Scène inconnue : ${name}`);
    select.value = name;
    return load(d, "/project-assets/");
  },
  renderAt: (time) => {
    t = time;
    draw();
  },
  exportVideo: async (name, format, width, durationOverride) => {
    const base = scenes.get(name);
    if (!base) throw new Error(`Scène inconnue : ${name}`);
    const d = durationOverride ? { ...base, settings: { ...base.settings, duration: durationOverride } } : base;
    const r = await exportVideo({ doc: d, resolveAsset: (uri) => resolveAsset(uri), format, width });
    const bytes = new Uint8Array(await r.blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { base64: btoa(bin), frames: r.frames, fps: r.fps, width: r.width, height: r.height, elapsed: r.elapsed, warnings: r.warnings };
  },
};

setupExportPanel(
  () => doc,
  () => (uri) => resolveAsset(uri, projectBase),
  () => setPlaying(false),
);

const initial = params.get("scene") ?? scenes.keys().next().value!;
if (!testMode) {
  select.value = initial;
  void load(scenes.get(initial)!, "/project-assets/");
}
requestAnimationFrame(loop);
