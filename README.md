# ai_bot

对话式任务管理助手（AI agents）。设计文档见 `docs/`。

## 后端（Cloudflare Workers）

```bash
cd backend
npm install
npm run dev
```

详见 [`backend/README.md`](backend/README.md)。任务 **1.1** / **1.2** / **1.3**（`FileStorage` + `R2Storage` + 可选预签名；无 R2 绑定时为 `NullFileStorage`）已完成；开通 R2 只需取消 `backend/wrangler.toml` 中 `[[r2_buckets]]` 注释并创建同名 bucket。
