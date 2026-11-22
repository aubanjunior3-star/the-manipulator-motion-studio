import { describe, expect, it } from "vitest";
import { resolveAsset } from "../../src/resolver";
import { AdaptiveResolution, advance, formatTime, frameAt, frameCount, timeOfFrame } from "../../src/timing";

describe("temps et images", () => {
  it("formatTime", () => {
    expect(formatTime(0)).toBe("00:00.00");
    expect(formatTime(3.456)).toBe("00:03.46");
    expect(formatTime(75.5)).toBe("01:15.50");
    expect(formatTime(-1)).toBe("00:00.00");
  });

  it("nombre d'images : 5 s à 30 i/s = 151 images (0 à 150)", () => {
    expect(frameCount(5, 30)).toBe(151);
    expect(frameCount(3, 60)).toBe(181);
  });

  it("image ↔ instant, sans dérive d'arrondi", () => {
    for (let f = 0; f <= 300; f++) expect(frameAt(timeOfFrame(f, 30), 30)).toBe(f);
    for (let f = 0; f <= 300; f++) expect(frameAt(timeOfFrame(f, 60), 60)).toBe(f);
  });

  it("lecture : boucle ou arrêt en fin de scène", () => {
    expect(advance(4.9, 0.2, 5, true).t).toBeCloseTo(0.1, 9);
    expect(advance(4.9, 0.2, 5, false)).toEqual({ t: 5, ended: true });
    expect(advance(1, 0.5, 5, false)).toEqual({ t: 1.5, ended: false });
  });
});

describe("résolution adaptative", () => {
  const run = (a: AdaptiveResolution, fps: number, seconds: number, enabled = true) => {
    let changed = false;
    for (let i = 0; i < fps * seconds; i++) changed = a.tick(1 / fps, enabled) || changed;
    return changed;
  };

  it("baisse sous 24 i/s, jusqu'au plancher", () => {
    const a = new AdaptiveResolution(2, 0.5);
    expect(run(a, 12, 1)).toBe(true);
    expect(a.ratio).toBeCloseTo(1.5, 9);
    run(a, 12, 10);
    expect(a.ratio).toBe(0.5);
  });

  it("remonte quand la cadence est largement suffisante, sans dépasser le maximum", () => {
    const a = new AdaptiveResolution(1, 0.4);
    run(a, 10, 3);
    expect(a.ratio).toBeLessThan(1);
    run(a, 60, 10);
    expect(a.ratio).toBe(1);
  });

  it("ne change rien à cadence correcte", () => {
    const a = new AdaptiveResolution(1);
    expect(run(a, 30, 5)).toBe(false);
    expect(a.ratio).toBe(1);
  });

  it("désactivée : revient à pleine résolution", () => {
    const a = new AdaptiveResolution(1);
    run(a, 10, 2);
    expect(a.ratio).toBeLessThan(1);
    run(a, 10, 1, false);
    expect(a.ratio).toBe(1);
  });
});

describe("résolution des assets", () => {
  it("builtin : catalogue → fichier servi", () => {
    expect(resolveAsset("builtin:fonts/display-bold")).toBe("/builtin/fonts/SpaceGrotesk-Bold.woff");
    expect(resolveAsset("builtin:fonts/inconnue")).toBeNull();
  });
  it("project : relatif au dossier du projet, refusé hors projet", () => {
    expect(resolveAsset("project:models/bottle.glb")).toBe("/project-assets/models/bottle.glb");
    expect(resolveAsset("project:models/bottle.glb", null)).toBeNull();
  });
  it("tout autre schéma est refusé", () => {
    expect(resolveAsset("https://exemple.com/x.glb")).toBeNull();
  });
});
