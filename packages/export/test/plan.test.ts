import { describe, expect, it } from "vitest";
import { estimateBytes, evenSize, fileNameFor, formatBytes, outputSize, targetBitrate, videoFrameCount, videoFrameTime } from "../src/plan.js";

describe("plan d'export", () => {
  it("nombre d'images : la vidéo dure exactement la durée demandée", () => {
    expect(videoFrameCount(5, 30)).toBe(150);
    expect(videoFrameCount(3, 60)).toBe(180);
    expect(videoFrameCount(0.01, 30)).toBe(1);
    expect(videoFrameCount(2.5, 24)).toBe(60);
  });

  it("instants exacts, sans dérive", () => {
    expect(videoFrameTime(0, 30)).toBe(0);
    expect(videoFrameTime(149, 30)).toBeCloseTo(4.9666667, 6);
    expect(videoFrameTime(9000, 30)).toBe(300);
  });

  it("débit : ≈ 8 Mb/s en 1080p30, 16 Mb/s en 1080p60, bornes respectées", () => {
    expect(targetBitrate(1920, 1080, 30) / 1e6).toBeCloseTo(8.1, 1);
    expect(targetBitrate(1920, 1080, 60) / 1e6).toBeCloseTo(16.2, 1);
    expect(targetBitrate(160, 90, 24)).toBe(2e6);
    expect(targetBitrate(7680, 4320, 120)).toBe(60e6);
  });

  it("dimensions paires", () => {
    expect(evenSize(1920, 1080)).toEqual({ width: 1920, height: 1080, adjusted: false });
    expect(evenSize(1081, 607)).toEqual({ width: 1080, height: 606, adjusted: true });
  });

  it("largeur imposée : garde le format d'image", () => {
    expect(outputSize(1920, 1080, 640)).toEqual({ width: 640, height: 360, adjusted: false });
    expect(outputSize(1080, 1920, 540)).toEqual({ width: 540, height: 960, adjusted: false });
    expect(outputSize(1920, 1080)).toEqual({ width: 1920, height: 1080, adjusted: false });
  });

  it("taille estimée et affichage", () => {
    expect(estimateBytes(8e6, 10)).toBe(10e6);
    expect(formatBytes(10e6)).toBe("9,5 Mo");
    expect(formatBytes(2048)).toBe("2 Ko");
    expect(fileNameFor("title_rise_3d", "mp4")).toBe("title_rise_3d.mp4");
  });
});
