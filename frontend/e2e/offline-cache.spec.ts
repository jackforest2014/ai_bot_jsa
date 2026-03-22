import { test, expect } from '@playwright/test'

import { e2eBackendEnabled, loginWithDisplayName } from './helpers'

test.describe('7.2 文件列表 IndexedDB 缓存', () => {
  test.skip(!e2eBackendEnabled(), '设置 E2E_BASE_URL 并启动前后端后运行')

  test('访问工作空间后存在 ai-bot-files-cache 库', async ({ page }) => {
    test.setTimeout(60_000)
    await loginWithDisplayName(page, `e2e_idb_${Date.now()}`)

    const listGet = page.waitForResponse(
      (r) => {
        if (r.request().method() !== 'GET' || !r.ok()) return false
        try {
          const { pathname } = new URL(r.url())
          return pathname === '/api/workspace'
        } catch {
          return false
        }
      },
      { timeout: 45_000 },
    )
    await page.getByRole('link', { name: '工作空间' }).click()
    await page.waitForURL(/\/workspace/)
    await expect(page.getByRole('heading', { name: '工作空间' })).toBeVisible()
    await listGet

    const hasCacheDb = await page.evaluate(async () => {
      if (!indexedDB.databases) return false
      const dbs = await indexedDB.databases()
      return dbs.some((d) => d.name === 'ai-bot-files-cache')
    })
    expect(hasCacheDb).toBe(true)
  })
})
