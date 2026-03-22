/**
 * SSE 对话流 soak（阶段六 · 流式压测示例）
 *
 * k6 的 http.post 会等到响应体结束才返回，因此每个 VU 在一次迭代内会占满
 * 一整条流（直到服务端发完并关闭连接）。适合「少量并发 + 等流结束」的 soak，
 * 不适合用几十 VU 模拟「同时很多长连接」——那会打爆 LLM 配额与 CPU。
 *
 * 前置：本地 npm run dev；准备 JWT 或用户 id、以及属于该用户的 session_id。
 *
 *   CHAT_SESSION_ID=<uuid> API_BEARER_TOKEN=<jwt> k6 run scripts/k6/chat-stream-soak.js
 *
 * 可选：API_BASE、CHAT_MESSAGE、CHAT_STREAM_TIMEOUT（默认 120s）、K6_VUS（默认 2）、K6_DURATION
 */
import http from 'k6/http';
import { check } from 'k6';

const base = __ENV.API_BASE || 'http://127.0.0.1:8787';
const token = (__ENV.API_BEARER_TOKEN || '').trim();
const sessionId = (__ENV.CHAT_SESSION_ID || '').trim();
const message = (__ENV.CHAT_MESSAGE || '用一句话回复：压测探活').trim();
const streamTimeout = __ENV.CHAT_STREAM_TIMEOUT || '120s';

export const options = {
  vus: Number(__ENV.K6_VUS || 2),
  duration: __ENV.K6_DURATION || '2m',
  thresholds: {
    http_req_failed: ['rate<0.15'],
  },
};

export function setup() {
  if (!token || !sessionId) {
    throw new Error(
      '缺少环境变量：API_BEARER_TOKEN、CHAT_SESSION_ID。可先登录拿到 token，再 POST /api/sessions 创建会话取 id。',
    );
  }
}

export default function () {
  const body = JSON.stringify({ message, session_id: sessionId });
  const res = http.post(`${base}/api/chat/stream`, body, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    timeout: streamTimeout,
  });

  check(res, {
    'stream 200': (r) => r.status === 200,
    '含 SSE event 行': (r) => typeof r.body === 'string' && r.body.includes('event:'),
    '流结束含 done': (r) =>
      typeof r.body === 'string' && (r.body.includes('event: done') || r.body.includes('event:done')),
  });
}
