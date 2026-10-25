import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    fileParallelism: false, // the DB suites share one database and time-sensitive assertions
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
