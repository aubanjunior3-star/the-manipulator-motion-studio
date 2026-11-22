/** Logique de lecture, sans DOM (testée unitairement). */

/** "mm:ss.cc" */
export function formatTime(t: number): string {
  const total = Math.max(0, t);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

/** Nombre d'images d'une scène : de l'image 0 à l'image du dernier instant (inclus). */
export const frameCount = (duration: number, fps: number): number => Math.floor(duration * fps + 1e-9) + 1;

/** Index de l'image affichée à l'instant t. */
export const frameAt = (t: number, fps: number): number => Math.floor(t * fps + 1e-6);

/** Instant exact d'une image. */
export const timeOfFrame = (frame: number, fps: number): number => frame / fps;

/** Avance la lecture de dt secondes ; en boucle, revient au début après la fin. */
export function advance(t: number, dt: number, duration: number, loop: boolean): { t: number; ended: boolean } {
  const next = t + dt;
  if (next <= duration) return { t: next, ended: false };
  if (!loop) return { t: duration, ended: true };
  return { t: duration > 0 ? next % duration : 0, ended: false };
}

/**
 * Résolution adaptative : pendant la lecture, si la cadence mesurée passe sous `target`
 * images/s, la densité de pixels baisse (×0,75, plancher `min`) ; si elle remonte nettement
 * au-dessus, elle remonte. À l'arrêt, l'image est toujours rendue à pleine résolution.
 */
export class AdaptiveResolution {
  ratio: number;
  private frames = 0;
  private elapsed = 0;
  fps = 0;

  constructor(
    readonly max: number,
    readonly min = 0.4,
    readonly target = 24,
  ) {
    this.ratio = max;
  }

  /** Enregistre une image affichée ; renvoie true si la densité doit changer. */
  tick(dt: number, enabled: boolean): boolean {
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 1) return false;
    this.fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    if (!enabled) {
      if (this.ratio !== this.max) {
        this.ratio = this.max;
        return true;
      }
      return false;
    }
    if (this.fps < this.target && this.ratio > this.min) {
      this.ratio = Math.max(this.min, this.ratio * 0.75);
      return true;
    }
    if (this.fps > this.target * 1.6 && this.ratio < this.max) {
      this.ratio = Math.min(this.max, this.ratio / 0.75);
      return true;
    }
    return false;
  }

  reset(): void {
    this.frames = 0;
    this.elapsed = 0;
  }
}
