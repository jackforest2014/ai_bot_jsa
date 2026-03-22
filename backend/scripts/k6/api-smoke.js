/**
 * 轻量压测 / 冒烟（阶段六 · 6.3）
 *
 * 覆盖：`GET /health`、`GET /health/llm`；若设 `API_BEARER_TOKEN` 则再加 `GET /api/sessions`、`GET /api/workspace`（文件列表）。
 *
 * 依赖：本机安装 k6 https://k6.io/docs/get-started/installation/
 *
 *   cd backend && k6 run scripts/k6/api-smoke.js
 *
 *   API_BASE=http://127.0.0.1:8787 API_BEARER_TOKEN=<jwt> K6_VUS=20 K6_DURATION=1m k6 run scripts/k6/api-smoke.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const base = __ENV.API_BASE || 'http://127.0.0.1:8787';
const token = (__ENV.API_BEARER_TOKEN || '').trim();

export const options = {
  vus: Number(__ENV.K6_VUS || 10),
  duration: __ENV.K6_DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

function authHeaders() {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export default function () {
  const h = authHeaders();
  const r1 = http.get(`${base}/health`);
  check(r1, { 'health 200': (r) => r.status === 200 });

  const r2 = http.get(`${base}/health/llm`);
  check(r2, { 'health/llm 200': (r) => r.status === 200 });

  if (token) {
    const r3 = http.get(`${base}/api/sessions`, { headers: h });
    check(r3, { 'sessions 200': (r) => r.status === 200 });

    const r4 = http.get(`${base}/api/workspace`, { headers: h });
    check(r4, { 'workspace 200': (r) => r.status === 200 });
  }

  sleep(0.3);
}
