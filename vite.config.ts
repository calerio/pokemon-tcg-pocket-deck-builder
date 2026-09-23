/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the site from /<repo>/, so every asset path must be relative to that.
export const BASE = "/pokemon-tcg-pocket-deck-builder/";

export default defineConfig({
  base: BASE,
  plugins: [react()],
  build: { target: "es2022", sourcemap: true },
  worker: { format: "es" },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // 8 GB machine: one worker process only.
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
