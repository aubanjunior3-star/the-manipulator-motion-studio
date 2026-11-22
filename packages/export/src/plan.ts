/** Calculs d'export sans dépendance au navigateur (testés unitairement). */

export type VideoFormat = "mp4" | "webm";

export const FORMATS: Record<VideoFormat, { label: string; codec: "avc" | "vp9"; extension: string; mime: string }> = {
  mp4: { label: "MP4 · H.264", codec: "avc", extension: "mp4", mime: "video/mp4" },
  webm: { label: "WebM · VP9", codec: "vp9", extension: "webm", mime: "video/webm" },
};

/** Nombre d'images d'une vidéo de `duration` s à `fps` : la vidéo dure exactement N / fps.
 *  (La visionneuse affiche aussi l'image de l'instant final ; la vidéo s'arrête juste avant.) */
export const videoFrameCount = (duration: number, fps: number): number => Math.max(1, Math.round(duration * fps));

/** Instant exact de l'image i (pas d'accumulation d'erreurs d'arrondi). */
export const videoFrameTime = (i: number, fps: number): number => i / fps;

/** Débit cible « haute qualité » : 0,13 bit par pixel et par image, borné à [2, 60] Mb/s.
 *  ≈ 8 Mb/s en 1080p30 et 16 Mb/s en 1080p60 (ordre de grandeur des recommandations de YouTube). */
export function targetBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(60e6, Math.max(2e6, width * height * fps * 0.13)));
}

/** Les encodeurs H.264/VP9 en 4:2:0 exigent des dimensions paires. */
export function evenSize(width: number, height: number): { width: number; height: number; adjusted: boolean } {
  const w = width - (width % 2);
  const h = height - (height % 2);
  return { width: w, height: h, adjusted: w !== width || h !== height };
}

/** Dimensions de sortie : celles du document, ou une largeur imposée (aperçu rapide) en gardant
 *  le format d'image. */
export function outputSize(docWidth: number, docHeight: number, width?: number): { width: number; height: number; adjusted: boolean } {
  if (!width || width === docWidth) return evenSize(docWidth, docHeight);
  return evenSize(width, Math.round((width * docHeight) / docWidth));
}

export function estimateBytes(bitrate: number, duration: number): number {
  return (bitrate * duration) / 8;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

export function fileNameFor(docId: string, format: VideoFormat): string {
  return `${docId}.${FORMATS[format].extension}`;
}
