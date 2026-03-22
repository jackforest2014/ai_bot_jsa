import { test, expect } from '@playwright/test'

import { e2eBackendEnabled, loginWithDisplayName } from './helpers'

test.describe('7.2 设置与任务侧栏', () => {
  test.skip(!e2eBackendEnabled(), '设置 E2E_BASE_URL 并启动前后端后运行')

  test('设置：偏好 JSON 与 AI 昵称保存', async ({ page }) => {
    test.setTimeout(90_000)
    await loginWithDisplayName(page, `e2e_set_${Date.now()}`)
    await page.getByRole('link', { name: '设置' }).click()
    await page.waitForURL(/\/settings/)
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()

    const nick = `E2E助手${Date.now().toString().slice(-4)}`
    await page.getByLabel(/AI 助手昵称/).fill(nick)

    const prefs = page.getByLabel(/偏好（JSON/)
    await prefs.fill(JSON.stringify({ e2e_theme: 'dark', e2e_flag: true }, null, 2))

    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText('已保存设置')).toBeVisible({ timeout: 30_000 })
  })

  test('任务：新建、列表与详情区', async ({ page }) => {
    test.setTimeout(90_000)
    await loginWithDisplayName(page, `e2e_task_${Date.now()}`)
    await expect(page.getByRole('heading', { name: '任务' })).toBeVisible()

    const title = `e2e-task-${Date.now()}`
    await page.getByPlaceholder('新建任务标题').fill(title)
    await page.getByRole('button', { name: '添加' }).click()

    await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByText(title, { exact: true }).click()
    const taskAside = page.locator('aside').filter({ has: page.getByRole('heading', { name: '任务' }) })
    const detailBlock = taskAside.locator('div').filter({ hasText: '任务详情' }).first()
    await expect(detailBlock).toBeVisible()
    await expect(detailBlock.getByText('无描述')).toBeVisible()
  })
})
