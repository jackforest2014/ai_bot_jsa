import { test, expect } from '@playwright/test'

import { e2eBackendEnabled, gotoLogin } from './helpers'

/** 轻量校验：登录页可访问（与 login-sessions 互补） */
test.describe('auth shell', () => {
  test.skip(!e2eBackendEnabled(), '设置 E2E_BASE_URL')

  test('登录页展示名称输入', async ({ page }) => {
    await gotoLogin(page)
    await expect(page.locator('#login-name')).toBeVisible()
  })
})
