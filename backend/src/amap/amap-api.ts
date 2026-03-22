/** 高德 Web 服务 API（地理编码、路径规划、静态图）；密钥由调用方注入，勿写死在代码中 */

import { logger } from '../lib/logger';

const REST = 'https://restapi.amap.com';
/** 单条日志体长度上限，避免 Worker 日志爆量 */
const AMAP_LOG_BODY_MAX = 48_000;

function logAmapException(scope: string, meta: Record<string, unknown>, body: unknown): void {
  let serialized: string;
  try {
    serialized = typeof body === 'string' ? body : JSON.stringify(body);
  } catch {
    serialized = String(body);
  }
  if (serialized.length > AMAP_LOG_BODY_MAX) {
    serialized = `${serialized.slice(0, AMAP_LOG_BODY_MAX)}…[truncated_total_${serialized.length}]`;
  }
  logger.warn('amap_api_exception', { scope, ...meta, response_body: serialized });
}

export type GeocodeHit = {
  location: string;
  formatted_address?: string;
  level?: string;
};

export async function amapGeocode(
  key: string,
  address: string,
  city?: string,
): Promise<{ ok: true; hits: GeocodeHit[] } | { ok: false; info: string }> {
  const url = new URL(`${REST}/v3/geocode/geo`);
  url.searchParams.set('key', key);
  url.searchParams.set('address', address);
  url.searchParams.set('output', 'JSON');
  if (city?.trim()) url.searchParams.set('city', city.trim());
  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logger.error('amap_geocode_network_error', { address, city, error: err });
    return { ok: false, info: `network:${err}` };
  }
  const raw = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.error('amap_geocode_json_parse_error', {
      address,
      city,
      httpStatus: res.status,
      rawBody: raw.slice(0, AMAP_LOG_BODY_MAX),
    });
    return { ok: false, info: 'invalid_json' };
  }
  if (!res.ok) {
    logAmapException('geocode_http_error', { address, city, httpStatus: res.status }, data);
    return { ok: false, info: `http_${res.status}` };
  }
  if (String(data.status) !== '1') {
    logAmapException(
      'geocode_status_not_ok',
      { address, city, info: data.info, status: data.status },
      data,
    );
    return { ok: false, info: String(data.info ?? 'geocode_failed') };
  }
  const geocodes = data.geocodes as unknown[] | undefined;
  if (!Array.isArray(geocodes) || !geocodes.length) {
    logAmapException('geocode_empty_hits', { address, city }, data);
    return { ok: false, info: 'no_geocode_result' };
  }
  const hits: GeocodeHit[] = geocodes.map((g) => {
    const o = g as Record<string, unknown>;
    return {
      location: String(o.location ?? ''),
      formatted_address: typeof o.formatted_address === 'string' ? o.formatted_address : undefined,
      level: typeof o.level === 'string' ? o.level : undefined,
    };
  });
  return { ok: true, hits };
}

/** 已是「经度,纬度」形式则原样返回，否则地理编码 */
export async function resolveToLngLat(
  key: string,
  addressOrCoord: string,
  city?: string,
): Promise<{ ok: true; location: string; formatted_address?: string } | { ok: false; info: string }> {
  const t = addressOrCoord.trim();
  const compact = t.replace(/\s/g, '');
  if (/^-?\d+\.\d+,-?\d+\.\d+$/.test(compact)) {
    return { ok: true, location: compact };
  }
  const g = await amapGeocode(key, t, city);
  if (!g.ok) return g;
  const first = g.hits[0];
  if (!first?.location) return { ok: false, info: 'empty_location' };
  return {
    ok: true,
    location: first.location,
    formatted_address: first.formatted_address,
  };
}

export type RouteMode = 'driving' | 'walking' | 'transit' | 'bicycling';

export type RoutePlanSummary = {
  mode: RouteMode;
  origin: string;
  destination: string;
  distance_m?: number;
  duration_s?: number;
  /** 合并后的折线，用于静态图 */
  polyline?: string;
  steps_summary?: string[];
  raw_info?: string;
};

function joinPolylinesFromDrivingWalking(data: Record<string, unknown>): string | undefined {
  const route = data.route as Record<string, unknown> | undefined;
  const paths = route?.paths as unknown[] | undefined;
  if (!Array.isArray(paths) || !paths.length) return undefined;
  const segs: string[] = [];
  for (const p of paths) {
    const path = p as Record<string, unknown>;
    const steps = path.steps as unknown[] | undefined;
    if (!Array.isArray(steps)) continue;
    for (const s of steps) {
      const poly = (s as Record<string, unknown>).polyline;
      if (typeof poly === 'string' && poly.trim()) segs.push(poly.trim());
    }
  }
  if (!segs.length) return undefined;
  return segs.join(';');
}

function joinPolylinesFromBicyclingV4(data: Record<string, unknown>): string | undefined {
  const d = data.data as Record<string, unknown> | undefined;
  const paths = d?.paths as unknown[] | undefined;
  if (!Array.isArray(paths) || !paths.length) return undefined;
  const segs: string[] = [];
  for (const p of paths) {
    const path = p as Record<string, unknown>;
    const steps = path.steps as unknown[] | undefined;
    if (!Array.isArray(steps)) continue;
    for (const s of steps) {
      const poly = (s as Record<string, unknown>).polyline;
      if (typeof poly === 'string' && poly.trim()) segs.push(poly.trim());
    }
  }
  if (!segs.length) return undefined;
  return segs.join(';');
}

export function downsamplePolyline(poly: string, maxPoints: number): string {
  const pts = poly.split(';').filter(Boolean);
  if (pts.length <= maxPoints) return poly;
  const step = Math.ceil(pts.length / maxPoints);
  const picked: string[] = [];
  for (let i = 0; i < pts.length; i += step) picked.push(pts[i]!);
  if (picked[picked.length - 1] !== pts[pts.length - 1]) picked.push(pts[pts.length - 1]!);
  return picked.join(';');
}

/** 写入 LLM tool 消息时限制体积，避免多轮 ReAct 时上下文爆炸、上游卡死或代理超时 */
export function polylineForToolOutput(poly: string | undefined, maxPoints = 72, maxChars = 10_000): string | undefined {
  if (!poly?.trim()) return undefined;
  let s = downsamplePolyline(poly.trim(), maxPoints);
  if (s.length > maxChars) {
    s = s.slice(0, maxChars);
    const cut = s.lastIndexOf(';');
    if (cut > 0) s = s.slice(0, cut);
  }
  return s;
}

export async function amapDirection(
  key: string,
  mode: RouteMode,
  origin: string,
  destination: string,
  transitCity?: string,
): Promise<{ ok: true; summary: RoutePlanSummary } | { ok: false; info: string }> {
  if (mode === 'bicycling') {
    const url = new URL(`${REST}/v4/direction/bicycling`);
    url.searchParams.set('key', key);
    url.searchParams.set('origin', origin);
    url.searchParams.set('destination', destination);
    let res: Response;
    try {
      res = await fetch(url.toString());
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      logger.error('amap_bicycling_network_error', { origin, destination, error: err });
      return { ok: false, info: `network:${err}` };
    }
    const raw = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      logger.error('amap_bicycling_json_parse_error', {
        origin,
        destination,
        httpStatus: res.status,
        rawBody: raw.slice(0, AMAP_LOG_BODY_MAX),
      });
      return { ok: false, info: 'invalid_json' };
    }
    if (!res.ok) {
      logAmapException('bicycling_http_error', { origin, destination, httpStatus: res.status }, data);
      return { ok: false, info: `http_${res.status}` };
    }
    if (Number(data.errcode) !== 0) {
      logAmapException(
        'bicycling_errcode',
        { origin, destination, errcode: data.errcode, errmsg: data.errmsg },
        data,
      );
      return { ok: false, info: String(data.errmsg ?? 'bicycling_failed') };
    }
    const d = data.data as Record<string, unknown> | undefined;
    const paths = d?.paths as unknown[] | undefined;
    const path0 = paths?.[0] as Record<string, unknown> | undefined;
    const poly = joinPolylinesFromBicyclingV4(data);
    const steps: string[] = [];
    const stepsArr = path0?.steps as unknown[] | undefined;
    if (Array.isArray(stepsArr)) {
      for (const s of stepsArr.slice(0, 12)) {
        const o = s as Record<string, unknown>;
        const ins = o.instruction;
        if (typeof ins === 'string' && ins.trim()) steps.push(ins.trim());
      }
    }
    return {
      ok: true,
      summary: {
        mode,
        origin,
        destination,
        distance_m: typeof path0?.distance === 'number' ? path0.distance : undefined,
        duration_s: typeof path0?.duration === 'number' ? path0.duration : undefined,
        polyline: poly,
        steps_summary: steps.length ? steps : undefined,
        raw_info: 'bicycling_v4',
      },
    };
  }

  if (mode === 'transit') {
    const city = transitCity?.trim();
    if (!city) {
      return { ok: false, info: 'transit_requires_city' };
    }
    const url = new URL(`${REST}/v3/direction/transit/integrated`);
    url.searchParams.set('key', key);
    url.searchParams.set('origin', origin);
    url.searchParams.set('destination', destination);
    url.searchParams.set('city', city);
    url.searchParams.set('output', 'JSON');
    let res: Response;
    try {
      res = await fetch(url.toString());
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      logger.error('amap_transit_network_error', { origin, destination, city, error: err });
      return { ok: false, info: `network:${err}` };
    }
    const raw = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      logger.error('amap_transit_json_parse_error', {
        origin,
        destination,
        city,
        httpStatus: res.status,
        rawBody: raw.slice(0, AMAP_LOG_BODY_MAX),
      });
      return { ok: false, info: 'invalid_json' };
    }
    if (!res.ok) {
      logAmapException('transit_http_error', { origin, destination, city, httpStatus: res.status }, data);
      return { ok: false, info: `http_${res.status}` };
    }
    if (String(data.status) !== '1') {
      logAmapException(
        'transit_status_not_ok',
        { origin, destination, city, info: data.info, status: data.status },
        data,
      );
      return { ok: false, info: String(data.info ?? 'transit_failed') };
    }
    const route = data.route as Record<string, unknown> | undefined;
    const transits = route?.transits as unknown[] | undefined;
    const t0 = transits?.[0] as Record<string, unknown> | undefined;
    const steps: string[] = [];
    if (t0) {
      const segments = t0.segments as unknown[] | undefined;
      if (Array.isArray(segments)) {
        for (const seg of segments.slice(0, 8)) {
          const s = seg as Record<string, unknown>;
          const bus = s.bus as Record<string, unknown> | undefined;
          const name = bus?.name ?? s.instruction;
          if (typeof name === 'string' && name.trim()) steps.push(name.trim());
        }
      }
    }
    return {
      ok: true,
      summary: {
        mode,
        origin,
        destination,
        distance_m: typeof t0?.distance === 'number' ? t0.distance : undefined,
        duration_s: typeof t0?.duration === 'number' ? t0.duration : undefined,
        polyline: undefined,
        steps_summary: steps.length ? steps : undefined,
        raw_info: 'transit_integrated',
      },
    };
  }

  const path = mode === 'walking' ? 'walking' : 'driving';
  const url = new URL(`${REST}/v3/direction/${path}`);
  url.searchParams.set('key', key);
  url.searchParams.set('origin', origin);
  url.searchParams.set('destination', destination);
  url.searchParams.set('extensions', 'all');
  url.searchParams.set('output', 'JSON');
  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logger.error('amap_direction_network_error', { path, origin, destination, error: err });
    return { ok: false, info: `network:${err}` };
  }
  const raw = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.error('amap_direction_json_parse_error', {
      path,
      origin,
      destination,
      httpStatus: res.status,
      rawBody: raw.slice(0, AMAP_LOG_BODY_MAX),
    });
    return { ok: false, info: 'invalid_json' };
  }
  if (!res.ok) {
    logAmapException(
      'direction_http_error',
      { path, origin, destination, httpStatus: res.status },
      data,
    );
    return { ok: false, info: `http_${res.status}` };
  }
  if (String(data.status) !== '1') {
    logAmapException(
      'direction_status_not_ok',
      { path, origin, destination, info: data.info, status: data.status },
      data,
    );
    return { ok: false, info: String(data.info ?? `${path}_failed`) };
  }
  const poly = joinPolylinesFromDrivingWalking(data);
  const route = data.route as Record<string, unknown> | undefined;
  const paths = route?.paths as unknown[] | undefined;
  const path0 = paths?.[0] as Record<string, unknown> | undefined;
  const steps: string[] = [];
  const stepsArr = path0?.steps as unknown[] | undefined;
  if (Array.isArray(stepsArr)) {
    for (const s of stepsArr.slice(0, 15)) {
      const o = s as Record<string, unknown>;
      const ins = o.instruction;
      if (typeof ins === 'string' && ins.trim()) steps.push(ins.trim());
    }
  }
  return {
    ok: true,
    summary: {
      mode,
      origin,
      destination,
      distance_m: typeof path0?.distance === 'number' ? path0.distance : undefined,
      duration_s: typeof path0?.duration === 'number' ? path0.duration : undefined,
      polyline: poly,
      steps_summary: steps.length ? steps : undefined,
      raw_info: path,
    },
  };
}

/** 高德 URI 导航页（坐标模式，推荐） */
export function buildAmapNavigationUri(
  originLngLat: string,
  destLngLat: string,
  uriMode: 'drive' | 'bus' | 'walk' | 'bike',
): string {
  const u = new URL('https://uri.amap.com/navigation');
  u.searchParams.set('from', originLngLat);
  u.searchParams.set('to', destLngLat);
  u.searchParams.set('mode', uriMode);
  u.searchParams.set('callnative', '0');
  return u.toString();
}

export function routeModeToUriMode(mode: RouteMode): 'drive' | 'bus' | 'walk' | 'bike' {
  switch (mode) {
    case 'walking':
      return 'walk';
    case 'transit':
      return 'bus';
    case 'bicycling':
      return 'bike';
    default:
      return 'drive';
  }
}

export function buildStaticMapUrl(
  key: string,
  originLngLat: string,
  destLngLat: string,
  polyline: string | undefined,
  size = '750*400',
  zoom = '12',
): string {
  const u = new URL(`${REST}/v3/staticmap`);
  u.searchParams.set('key', key);
  u.searchParams.set('size', size);
  u.searchParams.set('zoom', zoom);
  u.searchParams.append('markers', `small,0xFF0000,0:${originLngLat}`);
  u.searchParams.append('markers', `small,0x00AA00,0:${destLngLat}`);
  const pathData = polyline
    ? downsamplePolyline(polyline, 80)
    : `${originLngLat};${destLngLat}`;
  u.searchParams.set('paths', `weight:5,color:0x0000FF|${pathData}`);
  return u.toString();
}
