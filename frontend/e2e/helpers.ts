import { expect, type Page } from '@playwright/test'

/** 与 `playwright.config` 一致：显式设置后才跑依赖后端的用例 */
export function e2eBackendEnabled(): boolean {
  return Boolean(process.env.E2E_BASE_URL?.trim())
}

export async function gotoLogin(page: Page) {
  await page.goto('/login')
  await expect(page.getByLabel(/显示名称/)).toBeVisible()
}

export async function loginWithDisplayName(page: Page, name: string) {
  await gotoLogin(page)
  await page.getByLabel(/显示名称/).fill(name)
  await page.locator('#login-name').blur()
  await page.getByRole('button', { name: /进入|开始吧|欢迎回来/ }).click()
  await page.waitForURL(/\/($|\?)/, { timeout: 45_000 })
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: '退出登录' }).click()
  await page.waitForURL(/\/login/, { timeout: 15_000 })
}

/** 侧栏「会话列表」折叠时展开，便于点到「新对话」与历史行 */
export async function ensureSessionListVisible(page: Page) {
  const history = page.getByText('历史', { exact: true })
  if (await history.isVisible().catch(() => false)) return
  const toggle = page.getByRole('button', { name: /会话列表/ })
  if (await toggle.isVisible().catch(() => false)) await toggle.click()
  await expect(history).toBeVisible({ timeout: 10_000 })
}

/** 对话页底部工作空间面板收起时点击展开 */
export async function ensureWorkspaceDockExpanded(page: Page) {
  const expand = page.getByRole('button', { name: '展开工作空间面板' })
  if (await expand.isVisible().catch(() => false)) await expand.click()
  await expect(page.getByRole('heading', { name: '工作空间' })).toBeVisible({
    timeout: 15_000,
  })
}
