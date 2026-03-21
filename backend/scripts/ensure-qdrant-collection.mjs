/**
 * 读取 `.dev.vars` 与进程环境，在 Qdrant 上确保 `QDRANT_COLLECTION`（默认 memory）存在：
 * vectors.size = EMBEDDING_DIMENSIONS，distance = Cosine。
 * 用法：`npm run qdrant:ensure-collection`（需在 backend 目录，且已配置 QDRANT_URL + QDRANT_API_KEY）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

/** 读取 wrangler.toml 中 [vars] 下的 KEY = "value" / KEY = value（仅用于本地脚本，与 wrangler 注入一致） */
function loadWranglerVars() {
  const p = path.join(backendRoot, 'wrangler.toml');
  if (!fs.existsSync(p)) return {};
  const text = fs.readFileSync(p, 'utf8');
  const idx = text.indexOf('[vars]');
  if (idx === -1) return {};
  const rest = text.slice(idx + '[vars]'.length);
  const nextSection = rest.search(/^\[[^\]]+\]\s*$/m);
  const block = nextSection === -1 ? rest : rest.slice(0, nextSection);
  const out = {};
  for (const line of block.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadDevVars() {
  const p = path.join(backendRoot, '.dev.vars');
  if (!fs.existsSync(p)) return {};
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

const fileEnv = { ...loadWranglerVars(), ...loadDevVars(), ...process.env };
const v = fileEnv;
const baseUrl = (v.QDRANT_URL || '').replace(/\/$/, '');
const apiKey = v.QDRANT_API_KEY || '';
const collection = (v.QDRANT_COLLECTION || 'memory').trim();
const dim = Number.parseInt(v.EMBEDDING_DIMENSIONS || '768', 10);

if (!baseUrl || !apiKey) {
  console.error('缺少 QDRANT_URL 或 QDRANT_API_KEY（可在 wrangler.toml [vars] 与 .dev.vars 中配置）');
  process.exit(1);
}

if (!Number.isFinite(dim) || dim <= 0) {
  console.error('无效的 EMBEDDING_DIMENSIONS');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'api-key': apiKey,
};

const collUrl = `${baseUrl}/collections/${encodeURIComponent(collection)}`;

const getRes = await fetch(collUrl, { method: 'GET', headers: { 'api-key': apiKey } });
if (getRes.ok) {
  const body = await getRes.json().catch(() => ({}));
  console.log(`Collection "${collection}" 已存在`, body.result?.status || '');
  process.exit(0);
}

if (getRes.status !== 404) {
  const text = await getRes.text();
  console.error('查询 collection 失败:', getRes.status, text);
  process.exit(1);
}

const putRes = await fetch(collUrl, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    vectors: {
      size: dim,
      distance: 'Cosine',
    },
  }),
});

const putText = await putRes.text();
if (!putRes.ok) {
  console.error('创建 collection 失败:', putRes.status, putText);
  process.exit(1);
}

console.log(`已创建 collection "${collection}"，维度=${dim}，距离=Cosine`);
console.log(putText);
