import { test, expect } from '@playwright/test'

import {
  e2eBackendEnabled,
  ensureSessionListVisible,
  gotoLogin,
  loginWithDisplayName,
  logout,
} from './helpers'

test.describe('7.2 匿名登录与会话', () => {
  test.skip(!e2eBackendEnabled(), '设置 E2E_BASE_URL 并启动前后端后运行（见 README）')

  test('新用户：显示名称登录后进入对话页', async ({ page }) => {
    const name = `e2e_new_${Date.now()}`
    await loginWithDisplayName(page, name)
    // Chat 页会话标题为 main 内 h2；勿用 hasNot+RegExp（Playwright 要求 hasNot 为 Locator）
    await expect(page.locator('main').getByRole('heading', { level: 2 }).first()).toBeVisible()
    await expect(page.getByRole('textbox', { name: '对话输入' })).toBeVisible()
  })

  test('回访：同名称失焦后出现「欢迎回来」并可再次进入', async ({ page }) => {
    const name = `e2e_back_${Date.now()}`
    await loginWithDisplayName(page, name)
    await logout(page)
    await gotoLogin(page)
    await page.getByLabel(/显示名称/).fill(name)
    await page.locator('#login-name').blur()
    await expect(page.getByRole('button', { name: '欢迎回来' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: '欢迎回来' }).click()
    await page.waitForURL(/\/($|\?)/, { timeout: 45_000 })
    await expect(page.getByRole('textbox', { name: '对话输入' })).toBeVisible()
  })

  test('会话：新建、切换与重命名（⋯）', async ({ page }) => {
    await loginWithDisplayName(page, `e2e_sess_${Date.now()}`)
    await ensureSessionListVisible(page)

    // 会话标题可能也是「新对话」，会话行 role=button 的可访问名会变成「新对话 ⋯」，必须用 exact 只点工具栏按钮
    await page.getByRole('button', { name: '新对话', exact: true }).click()
    await expect(page.getByText('已创建新对话')).toBeVisible({ timeout: 15_000 })

    // 仅会话行外层（含标题 span）：避免与行内「⋯」的 <button> 混在一个 getByRole('button') 列表里
    const rows = page
      .locator('.max-h-64')
      .getByRole('button')
      .filter({ has: page.locator('span.line-clamp-2') })
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(async () => rows.count())
      .toBeGreaterThanOrEqual(2)

    // 两条会话标题可能相同，主区 h2 不变；断言高亮从第 1 行切到第 2 行（active = bg-slate-900）
    await expect(rows.first()).toHaveClass(/bg-slate-900/)
    await rows.nth(1).click()
    await expect(rows.nth(1)).toHaveClass(/bg-slate-900/, { timeout: 10_000 })
    await expect(rows.first()).not.toHaveClass(/bg-slate-900/)

    // headless 下右键不可靠；用「⋯」的 title（可访问名未必含「重命名」）
    await rows.first().getByTitle('重命名').click()
    // 进入重命名后该行不再有 line-clamp-2，勿再用上面的 rows 链式定位
    const renameInput = page.locator('.max-h-64').locator('input').first()
    await expect(renameInput).toBeVisible()
    await renameInput.fill(`e2e-renamed-${Date.now()}`)
    await renameInput.press('Enter')
    await expect(page.locator('.max-h-64').locator('input')).toHaveCount(0, { timeout: 15_000 })
  })
})
