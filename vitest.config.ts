import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "app"),
      realm: path.resolve(__dirname, "tests/unit-tests/mocks/realm.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
