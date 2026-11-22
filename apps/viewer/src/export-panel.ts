/** Panneau « Exporter en vidéo » de la visionneuse. */
import {
  estimateBytes,
  exportVideo,
  ExportError,
  formatBytes,
  outputSize,
  targetBitrate,
  type VideoFormat,
  videoFrameCount,
  webCodecsAvailable,
} from "@manipulator/export";
import type { AssetResolver } from "@manipulator/render-three";
import type { SceneDocument } from "@manipulator/scene-schema";
import { formatTime } from "./timing";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function setupExportPanel(getDoc: () => SceneDocument | null, getResolver: () => AssetResolver, beforeExport: () => void): void {
  const dialog = $<HTMLDialogElement>("export-dialog");
  const openBtn = $<HTMLButtonElement>("export-open");
  const formatSel = $<HTMLSelectElement>("export-format");
  const sizeSel = $<HTMLSelectElement>("export-size");
  const info = $("export-info");
  const progress = $("export-progress");
  const bar = $("export-bar");
  const status = $("export-status");
  const startBtn = $<HTMLButtonElement>("export-start");
  const cancelBtn = $<HTMLButtonElement>("export-cancel");
  const download = $<HTMLAnchorElement>("export-download");

  let controller: AbortController | null = null;
  let lastUrl: string | null = null;

  const setStatus = (text: string, error = false) => {
    status.textContent = text;
    status.classList.toggle("error", error);
  };

  const refreshInfo = () => {
    const doc = getDoc();
    if (!doc) return;
    const fps = doc.settings.fps ?? 30;
    const size = outputSize(doc.settings.width!, doc.settings.height!, Number(sizeSel.value) || undefined);
    const bitrate = targetBitrate(size.width, size.height, fps);
    const frames = videoFrameCount(doc.settings.duration, fps);
    info.textContent = `${size.width}×${size.height} · ${fps} i/s · ${formatTime(doc.settings.duration)} · ${frames} images · jusqu'à ~${formatBytes(estimateBytes(bitrate, doc.settings.duration))}`;
  };

  const fillSizes = () => {
    const doc = getDoc();
    if (!doc) return;
    const w = doc.settings.width!;
    sizeSel.replaceChildren();
    const full = outputSize(w, doc.settings.height!);
    sizeSel.add(new Option(`${full.width}×${full.height} (taille du projet)`, String(w)));
    for (const f of [0.5, 0.25]) {
      const s = outputSize(w, doc.settings.height!, Math.round(w * f));
      sizeSel.add(new Option(`${s.width}×${s.height} (aperçu rapide)`, String(s.width)));
    }
  };

  const busy = (on: boolean) => {
    startBtn.disabled = on;
    formatSel.disabled = on;
    sizeSel.disabled = on;
    cancelBtn.textContent = on ? "Annuler" : "Fermer";
    progress.hidden = !on && bar.style.width === "0%";
  };

  openBtn.addEventListener("click", () => {
    if (!getDoc()) return;
    fillSizes();
    refreshInfo();
    download.hidden = true;
    bar.style.width = "0%";
    progress.hidden = true;
    if (!webCodecsAvailable()) {
      setStatus("Ce navigateur ne sait pas encoder de vidéo. Utilisez Chrome ou Edge récents.", true);
      startBtn.disabled = true;
    } else {
      setStatus("");
      startBtn.disabled = false;
    }
    dialog.showModal();
  });
  formatSel.addEventListener("change", refreshInfo);
  sizeSel.addEventListener("change", refreshInfo);

  cancelBtn.addEventListener("click", () => {
    if (controller) controller.abort();
    else dialog.close();
  });
  dialog.addEventListener("cancel", (e) => {
    // Échap pendant un export : on annule l'export au lieu de cacher le panneau.
    if (controller) {
      e.preventDefault();
      controller.abort();
    }
  });

  startBtn.addEventListener("click", async () => {
    const doc = getDoc();
    if (!doc || controller) return;
    beforeExport();
    controller = new AbortController();
    download.hidden = true;
    bar.style.width = "0%";
    busy(true);
    progress.hidden = false;
    const t0 = performance.now();
    try {
      const result = await exportVideo({
        doc,
        resolveAsset: getResolver(),
        format: formatSel.value as VideoFormat,
        width: Number(sizeSel.value) || undefined,
        signal: controller.signal,
        onProgress: (done, total) => {
          bar.style.width = `${(done / total) * 100}%`;
          const elapsed = (performance.now() - t0) / 1000;
          const remaining = (elapsed / done) * (total - done);
          setStatus(`Image ${done} / ${total} · reste ~${Math.ceil(remaining)} s`);
        },
      });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(result.blob);
      download.href = lastUrl;
      download.download = result.fileName;
      download.textContent = `Télécharger ${result.fileName} (${formatBytes(result.blob.size)})`;
      download.hidden = false;
      download.click();
      setStatus(
        `Terminé en ${result.elapsed.toFixed(1).replace(".", ",")} s · ${result.frames} images` +
          (result.warnings.length ? ` · ⚠ ${result.warnings.join(" ")}` : ""),
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") setStatus("Export annulé.");
      else setStatus(e instanceof ExportError ? e.message : `Échec de l'export : ${(e as Error).message}`, true);
      bar.style.width = "0%";
    } finally {
      controller = null;
      busy(false);
    }
  });
}
