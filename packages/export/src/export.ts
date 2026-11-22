/**
 * Export vidéo dans le navigateur : rendu image par image (render-three) → encodage WebCodecs →
 * multiplexage Mediabunny → fichier MP4 (H.264) ou WebM (VP9). Rien à installer côté utilisateur.
 *
 * Exactitude : l'image i est rendue à l'instant i / fps et horodatée i / fps (pas d'image
 * sautée ni dupliquée, contrairement à une capture d'écran en temps réel).
 * Le rendu utilise son propre canvas, à la résolution de sortie : l'aperçu n'est pas touché.
 */
import { type AssetResolver, SceneRenderer } from "@manipulator/render-three";
import type { SceneDocument } from "@manipulator/scene-schema";
import { BufferTarget, CanvasSource, canEncodeVideo, Mp4OutputFormat, Output, Quality, WebMOutputFormat } from "mediabunny";
import { fileNameFor, FORMATS, outputSize, targetBitrate, type VideoFormat, videoFrameCount, videoFrameTime } from "./plan.js";

export interface ExportOptions {
  doc: SceneDocument;
  resolveAsset: AssetResolver;
  format: VideoFormat;
  /** Largeur de sortie (défaut : celle du document). La hauteur suit le format d'image. */
  width?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  mimeType: string;
  format: VideoFormat;
  width: number;
  height: number;
  fps: number;
  frames: number;
  duration: number;
  bitrate: number;
  /** Durée de l'export, en secondes. */
  elapsed: number;
  warnings: string[];
}

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

export function webCodecsAvailable(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

export async function exportVideo(opts: ExportOptions): Promise<ExportResult> {
  const t0 = performance.now();
  const { doc, format } = opts;
  const fmt = FORMATS[format];
  const warnings: string[] = [];

  if (!webCodecsAvailable()) {
    throw new ExportError("Ce navigateur ne sait pas encoder de vidéo (WebCodecs). Utilisez Chrome ou Edge récents.");
  }
  const docW = doc.settings.width ?? 1920;
  const docH = doc.settings.height ?? 1080;
  const size = outputSize(docW, docH, opts.width);
  if (size.adjusted) warnings.push(`Dimensions ajustées à ${size.width}×${size.height} (l'encodeur exige des valeurs paires).`);
  const fps = doc.settings.fps ?? 30;
  const frames = videoFrameCount(doc.settings.duration, fps);
  const bitrate = targetBitrate(size.width, size.height, fps);

  if (!(await canEncodeVideo(fmt.codec, { width: size.width, height: size.height, bitrate }))) {
    throw new ExportError(`L'encodage ${fmt.label} en ${size.width}×${size.height} n'est pas disponible dans ce navigateur.`);
  }

  const canvas = document.createElement("canvas");
  const renderer = new SceneRenderer({
    canvas,
    resolveAsset: opts.resolveAsset,
    pixelRatio: 1,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  let output: Output | null = null;
  try {
    renderer.setSize(size.width, size.height);
    const report = await renderer.load(doc);
    warnings.push(...report.warnings);

    const target = new BufferTarget();
    output = new Output({
      format: format === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
      target,
    });
    const source = new CanvasSource(canvas, {
      codec: fmt.codec,
      quality: new Quality({ bitrate, bitrateMode: "variable" }),
      keyFrameInterval: 2,
    });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();

    for (let i = 0; i < frames; i++) {
      if (opts.signal?.aborted) {
        await output.cancel();
        throw new DOMException("Export annulé.", "AbortError");
      }
      const t = videoFrameTime(i, fps);
      renderer.renderAt(t);
      await source.add(t, 1 / fps);
      opts.onProgress?.(i + 1, frames);
      // Laisse respirer l'interface (barre de progression, bouton Annuler).
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    await output.finalize();
    if (!target.buffer) throw new ExportError("Le fichier vidéo n'a pas été produit.");

    return {
      blob: new Blob([target.buffer], { type: fmt.mime }),
      fileName: fileNameFor(doc.id, format),
      mimeType: fmt.mime,
      format,
      width: size.width,
      height: size.height,
      fps,
      frames,
      duration: frames / fps,
      bitrate,
      elapsed: (performance.now() - t0) / 1000,
      warnings,
    };
  } catch (e) {
    if (output && output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => {});
    throw e;
  } finally {
    renderer.dispose();
  }
}
