import { test, expect } from '@playwright/test'

import { e2eBackendEnabled, loginWithDisplayName } from './helpers'

const streamE2eEnabled = e2eBackendEnabled() && Boolean(process.env.E2E_CHAT_STREAM?.trim())

;(streamE2eEnabled ? test.describe : test.describe.skip)('7.2 流式对话（依赖后端与模型）', () => {
  test('发送短消息后进入流式或出现助手回复', async ({ page }) => {
    test.setTimeout(120_000)
    await loginWithDisplayName(page, `e2e_chat_${Date.now()}`)

    const input = page.getByRole('textbox', { name: '对话输入' })
    await input.fill('请只回复一个字：好')
    await page.getByRole('button', { name: '发送' }).click()

    await expect(
      page.getByText('正在生成回复…').or(page.getByText('好', { exact: true })),
    ).toBeVisible({ timeout: 90_000 })
  })
})
