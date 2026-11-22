/// <reference path="./opentype.d.ts" />
/** Résolution et chargement des assets (polices, modèles). L'hôte (visionneuse, éditeur,
 *  rendu headless) fournit la correspondance URI → URL ; le moteur ne devine jamais un chemin. */
import opentype, { type Font } from "opentype.js";

export type AssetResolver = (uri: string) => string | null;

export class AssetError extends Error {
  constructor(
    public readonly uri: string,
    message: string,
  ) {
    super(message);
    this.name = "AssetError";
  }
}

const fontCache = new Map<string, Promise<Font>>();

export function loadFont(url: string): Promise<Font> {
  let p = fontCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => opentype.parse(buf));
    p.catch(() => fontCache.delete(url));
    fontCache.set(url, p);
  }
  return p;
}
