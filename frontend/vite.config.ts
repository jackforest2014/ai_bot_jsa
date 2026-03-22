import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // 本地 wrangler dev 默认端口；与 backend README 中 R2 CORS 示例 localhost:5173 一致
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        /** 长 SSE（多轮工具 + 大模型）避免代理默认空闲超时断开 */
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
})
