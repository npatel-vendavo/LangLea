import { defineConfig } from '@playwright/test'

const PORT = process.env.E2E_PORT || 4111
const MOCK_PORT = 5001

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1440, height: 900 }
  },
  webServer: [
    {
      command: `node e2e/mock-ai.mjs`,
      port: MOCK_PORT,
      reuseExistingServer: true,
      timeout: 15000
    },
    {
      command: `PORT=${PORT} JOB_DIR=/tmp/la-e2e-jobs MODULES_DIR=/tmp/la-e2e-modules AI_LOG_DIR=/tmp/la-e2e-logs node server/index.js`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 15000
    }
  ]
})
