import type { LLMMessage } from '../llm/types';

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * 从 search 工具 JSON 解析 `type === "images"` 且 `ok === true` 时的 `items[].image_url`。
 * - `null`：不是 images 成功载荷（不启用清洗）
 * - `[]`：images 检索成功但无任何直链（删除正文中所有 Markdown 图）
 */
export function parseSearchImagesAllowlistFromToolJson(output: string): string[] | null {
  let j: unknown;
  try {
    j = JSON.parse(output);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (o.type !== 'images') return null;
  if (o.ok !== true) return [];
  const items = o.items;
  if (!Array.isArray(items)) return [];
  const urls: string[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const u = (it as { image_url?: string }).image_url;
    if (typeof u === 'string' && u.trim()) urls.push(u.trim());
  }
  return urls;
}

function normalizeUrlForMatch(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    return u.href;
  } catch {
    return raw.trim();
  }
}

/**
 * 删除 `![](url)` 中 url 不在 allowlist 内的片段（防止背诵 xinhuanet 等）。
 * allowlist 与正文中的 URL 均做规范化后比较；再试一次原始字符串相等。
 */
export function sanitizeMarkdownImagesToAllowlist(text: string, allowlist: string[]): string {
  if (!text) return text;
  const allowed = new Set<string>();
  for (const u of allowlist) {
    const t = u.trim();
    if (!t) continue;
    allowed.add(t);
    try {
      allowed.add(normalizeUrlForMatch(t));
    } catch {
      /* ignore */
    }
  }

  return text.replace(MD_IMAGE_RE, (full, _alt, urlRaw: string) => {
    const raw = String(urlRaw).trim();
    if (!raw) return full;
    let norm = raw;
    try {
      norm = normalizeUrlForMatch(raw);
    } catch {
      /* keep raw */
    }
    if (allowed.has(raw) || allowed.has(norm)) return full;
    return '';
  });
}
