# 图片搜索 API 手动调试（SerpAPI vs Serper）

本仓库对话里的 **`search` 工具**走的是 **Serper**（`https://google.serper.dev`），与 **SerpAPI**（`https://serpapi.com`）是**不同厂商**，参数与返回 JSON 结构也不相同。若要对比两家结果，可分别用下面的 `curl` 自测。

## SerpAPI（Google Images）

文档入口：[Google Images API](https://serpapi.com/google-images-api)。  
端点：`GET https://serpapi.com/search`，`engine=google_images`，必填 `q` 与 `api_key`。

```bash
# 将 YOUR_SERPAPI_KEY 换成你在 serpapi.com 控制台里的 key
curl -sS "https://serpapi.com/search?engine=google_images&q=2026%20Chinese%20New%20Year%20fireworks&api_key=YOUR_SERPAPI_KEY" | head -c 4000
```

返回 JSON 里常见字段包括 `images_results` 数组；每条里常有 **`original`** / **`thumbnail`** 等直链字段（以官方文档为准）。

## Serper（与本项目一致）

源码：`backend/src/serper/serper-client.ts`。  
端点：`POST https://google.serper.dev/images`，Header `X-API-KEY`，Body JSON：`{ "q": "关键词", "num": 10 }`。

```bash
# 与 .dev.vars 中 SERPER_API_KEY 一致
curl -sS -X POST 'https://google.serper.dev/images' \
  -H 'Content-Type: application/json' \
  -H "X-API-KEY: ${SERPER_API_KEY}" \
  -d '{"q":"2026 Chinese New Year fireworks","num":10}' | head -c 4000
```

在 Worker 里我们会把 Serper 返回中的 `imageUrl` / `thumbnailUrl` 等归一成工具 JSON 的 **`items[].image_url`**，供模型做 `![](…)` 白名单与后端清洗。
