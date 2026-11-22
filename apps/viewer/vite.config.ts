import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

const repo = resolve(__dirname, "../..");

/** Sert deux dossiers en lecture seule :
 *  /builtin/*        → assets/builtin (ressources livrées : polices…)
 *  /project-assets/* → tests/fixtures/scenes/assets (assets « project: » des scènes de référence) */
const MOUNTS: Record<string, string> = {
  "/builtin/": resolve(repo, "assets/builtin"),
  "/project-assets/": resolve(repo, "tests/fixtures/scenes/assets"),
};
const TYPES: Record<string, string> = {
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

const serveMounts: Connect.NextHandleFunction = (req, res, next) => {
  const url = decodeURIComponent((req.url ?? "").split("?")[0]!);
  for (const [prefix, dir] of Object.entries(MOUNTS)) {
    if (!url.startsWith(prefix)) continue;
    const file = resolve(dir, url.slice(prefix.length));
    if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end("introuvable");
      return;
    }
    res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(res);
    return;
  }
  next();
};

const assetMounts = (): Plugin => ({
  name: "manipulator-asset-mounts",
  configureServer: (server) => void server.middlewares.use(serveMounts),
  configurePreviewServer: (server) => void server.middlewares.use(serveMounts),
});

export default defineConfig({
  plugins: [assetMounts()],
  server: { fs: { allow: [repo] } },
});
