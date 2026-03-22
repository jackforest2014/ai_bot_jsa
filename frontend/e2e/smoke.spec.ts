import { test, expect } from '@playwright/test'

import { e2eBackendEnabled } from './helpers'

test.describe('smoke', () => {
  test.skip(!e2eBackendEnabled(), '设置 E2E_BASE_URL（见 README · Playwright）')

  test('根路径可加载', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
  })
})
