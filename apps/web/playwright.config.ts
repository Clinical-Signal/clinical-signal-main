import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT ?? 3001);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${port}`,
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: `PORT=${port} npm run dev`,
    port,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
