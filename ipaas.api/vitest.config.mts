import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    coverage: { reporter: ["text", "json-summary"] },
    sequence: { concurrent: false },
  },
});
