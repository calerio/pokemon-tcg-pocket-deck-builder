import { defineConfig, devices } from "@playwright/test";

// WebKit only (Safari is the main target) and a single worker to keep memory use low.
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:4174/pokemon-tcg-pocket-deck-builder/", trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 860 } } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: "npx vite preview --port 4174 --strictPort",
    url: "http://localhost:4174/pokemon-tcg-pocket-deck-builder/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
