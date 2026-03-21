import type { Tool } from './tool-registry';
import {
  extractSerperItemsForMeta,
  isSerperSearchType,
  serperRequest,
  type SerperClientOptions,
  type SerperQuotaService,
  type SerperSearchType,
} from '../serper';

export type SearchToolOptions = SerperClientOptions & {
  quota: SerperQuotaService;
};

function normalizeMetaItems(raw: unknown[]): { title?: string; link?: string; snippet?: string }[] {
  return raw.map((item) => {
    if (!item || typeof item !== 'object') return {};
    const o = item as Record<string, unknown>;
    const title = pickString(o, ['title', 'name']);
    const link = pickString(o, ['link', 'url', 'source']);
    const snippet = pickString(o, ['snippet', 'description']);
    return { title, link, snippet };
  });
}

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * 联网搜索（Serper）。成功返回后计入 `serper_usage`；超软上限时返回可解析 JSON，不调外部 API。
 */
export function createSearchTool(opts: SearchToolOptions): Tool {
  return {
    name: 'search',
    description:
      '搜索实时公开信息（Google/Serper）。type 与 Serper 类型一致：organic、news、images、videos、places、shopping、scholar、patents。',
    parametersSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        type: {
          type: 'string',
          enum: [
            'organic',
            'news',
            'images',
            'videos',
            'places',
            'shopping',
            'scholar',
            'patents',
          ],
          description: '结果类型，默认 organic',
        },
        num: { type: 'number', description: '返回条数上限（可选，最大 100）' },
      },
      required: ['query'],
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return { output: JSON.stringify({ ok: false, error: 'invalid_json' }) };
      }
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) {
        return { output: JSON.stringify({ ok: false, error: 'query_required' }) };
      }
      const typeRaw = typeof args.type === 'string' ? args.type.trim() : '';
      const type: SerperSearchType = typeRaw && isSerperSearchType(typeRaw) ? typeRaw : 'organic';
      const num =
        typeof args.num === 'number'
          ? args.num
          : typeof args.num === 'string'
            ? Number.parseInt(args.num, 10)
            : undefined;

      const q = await opts.quota.check(ctx.userId);
      if (!q.ok) {
        return {
          output: JSON.stringify({
            ok: false,
            code: 'serper_quota_exceeded',
            message: q.message,
            count: q.count,
            limit: q.limit,
          }),
          toolResultMeta: {
            tool: 'search',
            notice: q.message,
            degraded: true,
          },
        };
      }

      let data: unknown;
      try {
        data = await serperRequest(opts, type, query, num);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          output: JSON.stringify({
            ok: false,
            code: 'serper_error',
            message,
          }),
          toolResultMeta: {
            tool: 'search',
            notice: message,
            degraded: true,
          },
        };
      }

      await opts.quota.recordSuccessfulSearch(ctx.userId);

      const itemsRaw = extractSerperItemsForMeta(type, data);
      const items = normalizeMetaItems(itemsRaw);

      const payload: Record<string, unknown> = {
        ok: true,
        type,
        query,
        result_count: items.length,
        items,
      };
      if (q.warning) {
        payload.quota_warning = q.warning;
      }

      return {
        output: JSON.stringify(payload),
        toolResultMeta: {
          tool: 'search',
          items,
          raw_ref: type,
          ...(q.warning ? { quota_warning: q.warning } : {}),
        },
      };
    },
  };
}
