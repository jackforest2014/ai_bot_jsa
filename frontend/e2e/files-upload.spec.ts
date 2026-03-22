import { test, expect } from '@playwright/test'

import { e2eBackendEnabled, ensureWorkspaceDockExpanded, loginWithDisplayName } from './helpers'

test.describe('7.2 工作空间上传', () => {
  test.skip(!e2eBackendEnabled(), '设置 E2E_BASE_URL 并启动前后端后运行')

  test('小文件上传：元数据弹窗与完成提示', async ({ page }) => {
    test.setTimeout(120_000)
    await loginWithDisplayName(page, `e2e_files_${Date.now()}`)
    await page.waitForURL(/\/$|\/\?/, { timeout: 15_000 })
    await ensureWorkspaceDockExpanded(page)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'e2e-small.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('e2e upload ' + Date.now()),
    })

    const dialog = page.getByRole('dialog', { name: /填写上传元数据|编辑类型/ })
    await expect(dialog.getByRole('heading', { name: '填写上传元数据' })).toBeVisible({
      timeout: 15_000,
    })
    await dialog.getByLabel(/语义类型/).selectOption('knowledge')
    await dialog.getByRole('button', { name: '开始上传' }).click()

    await expect(page.getByText(/已上传：e2e-small\.txt/)).toBeVisible({
      timeout: 60_000,
    })
  })
})

const multipartEnabled = e2eBackendEnabled() && Boolean(process.env.E2E_MULTIPART?.trim())

;(multipartEnabled ? test.describe : test.describe.skip)('7.2 分片上传（E2E_MULTIPART=1）', () => {
  test('大于 5MB 走分片路径', async ({ page }) => {
    test.setTimeout(300_000)
    await loginWithDisplayName(page, `e2e_mp_${Date.now()}`)
    await page.waitForURL(/\/$|\/\?/)
    await ensureWorkspaceDockExpanded(page)

    const size = 6 * 1024 * 1024
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'e2e-multipart.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.alloc(size, 7),
    })

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: '填写上传元数据' })).toBeVisible({
      timeout: 15_000,
    })
    await dialog.getByLabel(/语义类型/).selectOption('other')
    await dialog.getByRole('button', { name: '开始上传' }).click()

    await expect(page.getByText(/已上传：e2e-multipart\.bin/)).toBeVisible({
      timeout: 180_000,
    })
  })
})
