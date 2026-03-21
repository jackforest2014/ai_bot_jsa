/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 生产构建必填：API 根 URL，无尾部斜杠（技术方案 §5.1）。本地可留空并用 dev server proxy。 */
  readonly VITE_API_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
