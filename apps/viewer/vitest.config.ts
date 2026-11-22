import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Les tests visuels partagent un seul navigateur : exécution séquentielle.
    fileParallelism: false,
  },
});
