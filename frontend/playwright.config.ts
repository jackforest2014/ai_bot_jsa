import { defineConfig, devices } from '@playwright/test'

/**
 * 阶段七 · 任务 7.2：E2E（Playwright）
 *
 * 重要：`E2E_BASE_URL` 必须是「前端」地址（默认 Vite http://127.0.0.1:5173），不是 Worker API（8787）。
 * 浏览器加载 SPA 后，`/api` 由 Vite 代理到 `http://127.0.0.1:8787`（见 vite.config.ts）。
 *
 * 1) `cd backend && npm run dev`（8787）
 * 2) `cd frontend && npx playwright install chromium`
 * 3) `cd frontend && E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e`
 *    → 若 5173 未占用，会自动执行 `npm run dev` 拉起 Vite（可用 E2E_SKIP_WEB_SERVER=1 关闭）。
 *
 * 可选：`E2E_CHAT_STREAM=1`、`E2E_MULTIPART=1`
 */

const e2eBase = process.env.E2E_BASE_URL?.trim()

/** 在已设置 E2E_BASE_URL 时自动启动 Vite，避免未开 `npm run dev` 导致 net::ERR_CONNECTION_REFUSED */
function viteWebServer():
  | { command: string; url: string; reuseExistingServer: boolean; timeout: number }
  | undefined {
  if (!e2eBase || process.env.E2E_SKIP_WEB_SERVER === '1') return undefined
  try {
    const u = new URL(e2eBase)
    const port = u.port || '5173'
    const origin = `${u.protocol}//${u.hostname}:${port}`
    return {
      command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
      url: origin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    }
  } catch {
    return undefined
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: e2eBase ?? 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  webServer: viteWebServer(),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
