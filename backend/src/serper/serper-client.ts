import { workerFetch } from '../lib/worker-fetch';
import type { SerperSearchType } from './types';

const SERPER_BASE = 'https://google.serper.dev';

/** Serper `type` → HTTP 路径段（places 对应 Maps API） */
const TYPE_TO_PATH: Record<SerperSearchType, string> = {
  organic: 'search',
  news: 'news',
  images: 'images',
  videos: 'videos',
  places: 'maps',
  shopping: 'shopping',
  scholar: 'scholar',
  patents: 'patents',
};

export type SerperClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** 覆盖默认 origin，测试用 */
  baseUrl?: string;
};

/**
 * POST `https://google.serper.dev/{search|news|...}`，Header `X-API-KEY`。
 */
export async function serperRequest(
  options: SerperClientOptions,
  type: SerperSearchType,
  query: string,
  num?: number,
): Promise<unknown> {
  const key = options.apiKey.trim();
  if (!key) {
    throw new Error('Serper API key missing');
  }
  const base = (options.baseUrl ?? SERPER_BASE).replace(/\/$/, '');
  const path = TYPE_TO_PATH[type];
  const url = `${base}/${path}`;
  const fetchFn = options.fetchImpl ?? workerFetch;
  const body: Record<string, unknown> = { q: query };
  if (num !== undefined && Number.isFinite(num) && num > 0) {
    body.num = Math.min(100, Math.floor(num));
  }
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': key,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Serper HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Serper response is not JSON');
  }
}

/** 供 SSE `tool_result_meta` 摘要（不同 type 字段名不同；images 等还含 imageUrl 等，由 search-tool 归一成 image_url） */
export function extractSerperItemsForMeta(type: SerperSearchType, data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const pickArrays = (): unknown[] => {
    const keysByType: Record<SerperSearchType, string[]> = {
      organic: ['organic'],
      news: ['news'],
      images: ['images'],
      videos: ['videos'],
      places: ['places'],
      shopping: ['shopping'],
      scholar: ['organic', 'scholar'],
      patents: ['organic', 'patents'],
    };
    for (const k of keysByType[type]) {
      const arr = d[k];
      if (Array.isArray(arr)) return arr;
    }
    for (const v of Object.values(d)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        return v;
      }
    }
    return [];
  };
  return pickArrays();
}
