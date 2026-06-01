import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './src/__tests__/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://localhost:1420',
    headless: true,
    screenshot: 'only-on-failure',
  },
})
