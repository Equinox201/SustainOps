import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Several files each boot an in-memory Postgres (WASM + pgvector); give
    // setup hooks room when they start in parallel on a busy machine.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
