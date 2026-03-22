#!/usr/bin/env node
/**
 * 真实 LLM 流式压测：随机 prompt、并发请求、记录首 token 时延（TTFT）与成功率。
 *
 * 通过本仓库 POST /api/chat/stream，指标包含：Worker + 意图/RAG/模型侧整体；瓶颈可能在供应商 RPM/TPM。
 *
 * 用法：
 *   cd backend
 *   export API_BEARER_TOKEN='...'
 *   export CHAT_SESSION_ID='<uuid>'
 *   npm run loadtest:ttft
 *
 * 环境变量：
 *   API_BASE              默认 http://127.0.0.1:8787
 *   API_BEARER_TOKEN      必填
 *   CHAT_SESSION_ID       必填（属于该用户的会话）
 *   TTFT_DATASET          JSON 路径，默认 scripts/load/datasets/sample-chat-prompts.json
 *   TTFT_CONCURRENCY      并发 worker 数，默认 3
 *   TTFT_TOTAL            总请求数，默认 30
 *   TTFT_READ_TIMEOUT_MS  单请求读流超时（毫秒），默认 180000
 *
 * 数据集：JSON 数组，元素为字符串；或 { "message": "..." } / { "prompt": "..." }。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const TOKEN = (process.env.API_BEARER_TOKEN || '').trim();
const SESSION_ID = (process.env.CHAT_SESSION_ID || '').trim();
const DATASET_PATH = path.resolve(
  process.cwd(),
  process.env.TTFT_DATASET || path.join('scripts', 'load', 'datasets', 'sample-chat-prompts.json'),
);
const CONCURRENCY = Math.max(1, parseInt(process.env.TTFT_CONCURRENCY || '3', 10));
const TOTAL = Math.max(1, parseInt(process.env.TTFT_TOTAL || '30', 10));
const READ_TIMEOUT_MS = Math.max(5000, parseInt(process.env.TTFT_READ_TIMEOUT_MS || '180000', 10));

function loadDataset() {
  const raw = fs.readFileSync(DATASET_PATH, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('dataset 须为非空 JSON 数组');
  }
  return data.map((x) => {
    if (typeof x === 'string') return x.trim();
    if (x && typeof x === 'object') {
      if (typeof x.message === 'string') return x.message.trim();
      if (typeof x.prompt === 'string') return x.prompt.trim();
    }
    return String(x).trim();
  }).filter(Boolean);
}

/**
 * 从流中读到首个 `event: token` 且 `content` 非空；返回从 wallStart 到该时刻的毫秒数。
 */
async function readUntilFirstAssistantTokenMs(reader, wallStart, externalSignal) {
  const decoder = new TextDecoder();
  let buf = '';

  const combinedSignal = externalSignal;
  while (true) {
    if (combinedSignal?.aborted) return null;
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const blocks = buf.split('\n\n');
    buf = blocks.pop() || '';

    for (const block of blocks) {
      let eventName = '';
      const dataLines = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
      if (eventName !== 'token' || dataLines.length === 0) continue;
      const dataRaw = dataLines.join('');
      try {
        const j = JSON.parse(dataRaw);
        const c = j.content;
        if (typeof c === 'string' && c.length > 0) {
          return performance.now() - wallStart;
        }
      } catch {
        /* ignore malformed */
      }
    }
  }
  return null;
}

async function oneRequest(message) {
  const ac = new AbortController();
  const wallStart = performance.now();
  const timer = setTimeout(() => ac.abort(), READ_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, session_id: SESSION_ID }),
      signal: ac.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      clearTimeout(timer);
      return {
        ok: false,
        httpStatus: res.status,
        ttftMs: null,
        wallMs: performance.now() - wallStart,
        error: text.slice(0, 300),
      };
    }

    if (!res.body) {
      clearTimeout(timer);
      return {
        ok: false,
        httpStatus: res.status,
        ttftMs: null,
        wallMs: performance.now() - wallStart,
        error: 'empty_body',
      };
    }

    const reader = res.body.getReader();
    const ttftMs = await readUntilFirstAssistantTokenMs(reader, wallStart, ac.signal);
    try {
      ac.abort();
    } catch {
      /* */
    }
    try {
      await reader.cancel();
    } catch {
      /* */
    }
    clearTimeout(timer);

    const wallMs = performance.now() - wallStart;
    return {
      ok: ttftMs != null,
      httpStatus: res.status,
      ttftMs,
      wallMs,
      error: ttftMs == null ? 'no_first_token_before_close' : null,
    };
  } catch (e) {
    clearTimeout(timer);
    const name = e instanceof Error ? e.name : '';
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      httpStatus: 0,
      ttftMs: null,
      wallMs: performance.now() - wallStart,
      error: name === 'AbortError' ? 'timeout_or_aborted' : msg,
    };
  }
}

/** 线性插值分位数，p 为 0–100 */
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

async function main() {
  if (!TOKEN || !SESSION_ID) {
    console.error('缺少 API_BEARER_TOKEN 或 CHAT_SESSION_ID');
    process.exit(1);
  }

  const messages = loadDataset();
  let job = 0;

  async function worker() {
    const batch = [];
    while (true) {
      const id = job++;
      if (id >= TOTAL) break;
      const msg = messages[Math.floor(Math.random() * messages.length)];
      batch.push(await oneRequest(msg));
    }
    return batch;
  }

  const t0 = performance.now();
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  const nested = await Promise.all(workers);
  const results = nested.flat();
  const wallTotalSec = (performance.now() - t0) / 1000;

  const oks = results.filter((r) => r.ok);
  const ttfts = oks.map((r) => r.ttftMs).filter((x) => x != null).sort((a, b) => a - b);

  const summary = {
    api_base: API_BASE,
    dataset: DATASET_PATH,
    concurrency: CONCURRENCY,
    total: results.length,
    success: oks.length,
    success_rate: results.length ? oks.length / results.length : 0,
    wall_clock_sec: Math.round(wallTotalSec * 1000) / 1000,
    achieved_rps: wallTotalSec > 0 ? Math.round((results.length / wallTotalSec) * 1000) / 1000 : 0,
    ttft_ms: {
      min: ttfts.length ? Math.round(ttfts[0]) : null,
      p50: ttfts.length ? Math.round(percentile(ttfts, 50)) : null,
      p95: ttfts.length ? Math.round(percentile(ttfts, 95)) : null,
      max: ttfts.length ? Math.round(ttfts[ttfts.length - 1]) : null,
    },
    note:
      'TTFT 为首个含非空 content 的 SSE token 事件相对「发起 fetch」的耗时；含网络与本服务内意图/RAG/首包模型延迟。提前 abort 后不再统计整流时长。',
  };

  console.log(JSON.stringify(summary, null, 2));

  const fails = results.filter((r) => !r.ok);
  if (fails.length > 0) {
    const reasons = {};
    for (const f of fails) {
      const k = f.error || `http_${f.httpStatus}`;
      reasons[k] = (reasons[k] || 0) + 1;
    }
    console.error('failure_breakdown:', JSON.stringify(reasons));
  }

  process.exit(oks.length === results.length ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
