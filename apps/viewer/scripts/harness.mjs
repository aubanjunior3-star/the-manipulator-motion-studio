// Lance la visionneuse (serveur Vite) et un Chromium headless, en mode test (?test).
// Partagé par scripts/render-frames.mjs et les tests visuels.
import { createServer } from "vite";
import { chromium } from "playwright";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function startHarness({ width = 480, port = 0 } = {}) {
  const server = await createServer({ root, configFile: resolve(root, "vite.config.ts"), server: { port, host: "127.0.0.1" }, logLevel: "error" });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/?test&w=${width}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Math.max(800, width + 40), height: 2000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__viewer !== undefined);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
  return {
    page,
    errors,
    gpu: renderer,
    scenes: () => page.evaluate(() => window.__viewer.scenes),
    load: (name) => page.evaluate((n) => window.__viewer.load(n), name),
    /** Rend l'instant t et renvoie le PNG du canvas. */
    frame: async (t) => {
      await page.evaluate((x) => window.__viewer.renderAt(x), t);
      return page.locator("#canvas").screenshot({ type: "png" });
    },
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}
