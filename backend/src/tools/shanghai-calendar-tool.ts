import {
  formatShanghaiDateWeekdayShort,
  shanghaiCalendarUtcNoon,
} from '../chat/system-clock-block';
import { type Tool, ToolRegistry } from './tool-registry';

const US_WD_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** 东八区日历日（与给定瞬时时刻在同一日） */
export function shanghaiYmdFromMs(ms: number): { y: number; m: number; d: number } {
  const cur = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);
  const [yy, mm, dd] = cur.split('-').map(Number);
  return { y: yy, m: mm, d: dd };
}

function shanghaiIsoWeekday(ms: number): number {
  const w = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
  }).format(ms);
  return US_WD_TO_ISO[w] ?? 1;
}

/** 东八区该公历日 00:00:00 的 Unix 秒 */
export function shanghaiStartOfDayUnixSec(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d, -8, 0, 0) / 1000);
}

/** 东八区该公历日 23:59:00 的 Unix 秒 */
export function shanghaiEndOfDayUnixSec(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d, 15, 59, 0) / 1000);
}

export type CalendarResolveItem =
  | { kind: 'offset'; days_from_today: number; ref?: string }
  | { kind: 'next_weekday'; weekday: number; ref?: string };

export type CalendarResolvedRow = {
  ref?: string;
  kind: string;
  /** 如 2026年3月24日周二 */
  date_zh: string;
  /** 该日东八区 00:00:00 */
  starts_at_unix: number;
  /** 该日东八区 23:59:00 */
  ends_at_unix: number;
};

function resolveNextWeekday(nowMs: number, targetIsoDow: number): number {
  for (let d = 1; d <= 366; d++) {
    const ms = shanghaiCalendarUtcNoon(nowMs, d);
    if (shanghaiIsoWeekday(ms) === targetIsoDow) {
      return d;
    }
  }
  return 366;
}

/**
 * 以服务器传入的「当前时刻」为准，解析相对日 / 下一个某星期几（东八区）。
 * 供模型在写任务、回答用户前换算公历与默认起止秒级时间戳。
 */
export function resolveShanghaiCalendarItems(
  nowMs: number,
  items: CalendarResolveItem[],
): { ok: true; resolved: CalendarResolvedRow[] } | { ok: false; error: string } {
  const resolved: CalendarResolvedRow[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'invalid_item' };
    }
    const kind = (raw as { kind?: string }).kind;
    const ref = typeof (raw as { ref?: string }).ref === 'string' ? (raw as { ref: string }).ref : undefined;
    if (kind === 'offset') {
      const days = (raw as { days_from_today?: number }).days_from_today;
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > 366) {
        return { ok: false, error: 'invalid_days_from_today' };
      }
      const noonMs = shanghaiCalendarUtcNoon(nowMs, days);
      const { y, m, d } = shanghaiYmdFromMs(noonMs);
      resolved.push({
        ref,
        kind: 'offset',
        date_zh: formatShanghaiDateWeekdayShort(noonMs),
        starts_at_unix: shanghaiStartOfDayUnixSec(y, m, d),
        ends_at_unix: shanghaiEndOfDayUnixSec(y, m, d),
      });
      continue;
    }
    if (kind === 'next_weekday') {
      const weekday = (raw as { weekday?: number }).weekday;
      if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
        return { ok: false, error: 'invalid_weekday' };
      }
      const delta = resolveNextWeekday(nowMs, weekday);
      const noonMs = shanghaiCalendarUtcNoon(nowMs, delta);
      const { y, m, d } = shanghaiYmdFromMs(noonMs);
      resolved.push({
        ref,
        kind: 'next_weekday',
        date_zh: formatShanghaiDateWeekdayShort(noonMs),
        starts_at_unix: shanghaiStartOfDayUnixSec(y, m, d),
        ends_at_unix: shanghaiEndOfDayUnixSec(y, m, d),
      });
      continue;
    }
    return { ok: false, error: 'unknown_kind' };
  }
  return { ok: true, resolved };
}

function createResolveShanghaiCalendarTool(): Tool {
  return {
    name: 'resolve_shanghai_calendar',
    description:
      '根据**本次请求时**系统时间，在东八区（Asia/Shanghai）解析「明天」「后天」「下周一」「下周五」等相对说法，返回该日的公历+星期中文、以及该日默认起止 Unix 秒（当日 00:00:00 与 23:59:00）。**在写入 add_task 的 starts_at/ends_at 或向用户报公历前应先调用**；勿心算星期。`next_weekday` 为「严格晚于今天」的下一个该星期几（今天若为周日，weekday=1 得到明天周一）。',
    parametersSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description:
            '每条一项；kind=offset 时 days_from_today：0=今天，1=明天，2=后天；kind=next_weekday 时 weekday：1=周一…7=周日',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['offset', 'next_weekday'] },
              days_from_today: { type: 'integer', minimum: 0, maximum: 366 },
              weekday: { type: 'integer', minimum: 1, maximum: 7 },
              ref: { type: 'string', description: '可选，回显用户原话片段便于对照' },
            },
            required: ['kind'],
          },
        },
      },
      required: ['items'],
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return { output: JSON.stringify({ ok: false, error: 'invalid_json' }) };
      }
      const items = args.items;
      if (!Array.isArray(items) || items.length === 0) {
        return { output: JSON.stringify({ ok: false, error: 'items_required' }) };
      }
      if (items.length > 24) {
        return { output: JSON.stringify({ ok: false, error: 'too_many_items' }) };
      }
      const nowMs = Date.now();
      const parsed: CalendarResolveItem[] = [];
      for (const it of items) {
        if (!it || typeof it !== 'object') {
          return { output: JSON.stringify({ ok: false, error: 'invalid_item' }) };
        }
        const o = it as Record<string, unknown>;
        const kind = o.kind === 'offset' || o.kind === 'next_weekday' ? o.kind : null;
        if (!kind) {
          return { output: JSON.stringify({ ok: false, error: 'invalid_kind' }) };
        }
        if (kind === 'offset') {
          const days = o.days_from_today;
          if (typeof days !== 'number') {
            return { output: JSON.stringify({ ok: false, error: 'offset_needs_days_from_today' }) };
          }
          parsed.push({
            kind: 'offset',
            days_from_today: days,
            ref: typeof o.ref === 'string' ? o.ref : undefined,
          });
        } else {
          const weekday = o.weekday;
          if (typeof weekday !== 'number') {
            return { output: JSON.stringify({ ok: false, error: 'next_weekday_needs_weekday' }) };
          }
          parsed.push({
            kind: 'next_weekday',
            weekday,
            ref: typeof o.ref === 'string' ? o.ref : undefined,
          });
        }
      }
      const out = resolveShanghaiCalendarItems(nowMs, parsed);
      if (!out.ok) {
        return { output: JSON.stringify(out) };
      }
      return {
        output: JSON.stringify({
          ok: true,
          timezone: 'Asia/Shanghai',
          user_id: ctx.userId,
          resolved: out.resolved,
        }),
      };
    },
  };
}

export function registerShanghaiCalendarTool(registry: ToolRegistry): void {
  registry.register(createResolveShanghaiCalendarTool());
}
