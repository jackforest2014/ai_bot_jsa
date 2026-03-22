import { logger } from '../lib/logger';
import type { Tool, ToolExecuteResult, ToolResultMeta } from './tool-registry';
import {
  amapGeocode,
  amapDirection,
  buildAmapNavigationUri,
  buildStaticMapUrl,
  polylineForToolOutput,
  resolveToLngLat,
  routeModeToUriMode,
  type RouteMode,
} from '../amap/amap-api';

export type AmapToolsOptions = {
  apiKey: string;
};

function parseMode(raw: unknown): RouteMode {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'walking' || s === 'walk' || s === '步行') return 'walking';
  if (s === 'transit' || s === 'bus' || s === '公交' || s === '地铁' || s === '公共交通') return 'transit';
  if (s === 'bicycling' || s === 'bike' || s === '骑行' || s === '骑车') return 'bicycling';
  return 'driving';
}

function metaFor(tool: string, extra?: Partial<ToolResultMeta>): ToolResultMeta {
  return { tool, ...extra };
}

/** 高德返回配额/参数等业务失败时仍属「工具执行成功」（未抛错），须单独打日志便于与 analytics_metric 对照 */
function warnAmapToolResult(tool: string, detail: Record<string, unknown>): void {
  logger.warn('amap_tool_business_error', { tool, ...detail });
}

/**
 * 高德地图相关工具：地理编码、路径规划、导航 URI、静态路线图。
 * 需在 Worker 环境配置 AMAP_WEB_KEY 后注册。
 */
export function createAmapTools(opts: AmapToolsOptions): Tool[] {
  const key = opts.apiKey;

  const geocodeTool: Tool = {
    name: 'amap_geocode',
    description:
      '将中文或英文地址转为「经度,纬度」。路线查询时若仅有地名、无坐标，应先调用本工具解析起点或终点。可指定 city 提高命中率。',
    parametersSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: '要解析的地址或 POI 名称' },
        city: { type: 'string', description: '城市（可选，如「北京」），用于消歧' },
      },
      required: ['address'],
    },
    async execute(argsJson): Promise<ToolExecuteResult> {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return { output: JSON.stringify({ ok: false, _tool_name: 'amap_geocode', error: 'invalid_json' }) };
      }
      const address = typeof args.address === 'string' ? args.address.trim() : '';
      const city = typeof args.city === 'string' ? args.city.trim() : undefined;
      if (!address) {
        return { output: JSON.stringify({ ok: false, _tool_name: 'amap_geocode', error: 'address_required' }) };
      }
      const r = await amapGeocode(key, address, city);
      if (!r.ok) {
        warnAmapToolResult('amap_geocode', { error: r.info, address });
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_geocode',
            error: r.info,
            address,
          }),
        };
      }
      return {
        output: JSON.stringify({
          ok: true,
          _tool_name: 'amap_geocode',
          hits: r.hits,
          hint: '将 location 用于 amap_route_plan / amap_navigation_uri / amap_route_static_map',
        }),
        toolResultMeta: metaFor('amap_geocode', { items: r.hits as unknown[] }),
      };
    },
  };

  const routePlanTool: Tool = {
    name: 'amap_route_plan',
    description:
      '路径规划：支持驾车 driving、步行 walking、公交 transit、骑行 bicycling。origin / destination 可为地址或「经度,纬度」。公交 transit 时必须传 transit_city（如「北京」）。返回距离、时间、步骤摘要与折线（可用于静态图）。',
    parametersSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: '起点地址或 经度,纬度' },
        destination: { type: 'string', description: '终点地址或 经度,纬度' },
        mode: {
          type: 'string',
          enum: ['driving', 'walking', 'transit', 'bicycling'],
          description: '出行方式；公交为 transit',
        },
        transit_city: {
          type: 'string',
          description: '公交规划必填：城市名，如「上海」',
        },
        geocode_city: {
          type: 'string',
          description: '地理编码时可选的城市提示（起终点为地址时）',
        },
      },
      required: ['origin', 'destination', 'mode'],
    },
    async execute(argsJson): Promise<ToolExecuteResult> {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return { output: JSON.stringify({ ok: false, _tool_name: 'amap_route_plan', error: 'invalid_json' }) };
      }
      const originIn = typeof args.origin === 'string' ? args.origin.trim() : '';
      const destIn = typeof args.destination === 'string' ? args.destination.trim() : '';
      const mode = parseMode(args.mode);
      const geocodeCity = typeof args.geocode_city === 'string' ? args.geocode_city.trim() : undefined;
      const transitCity =
        typeof args.transit_city === 'string' ? args.transit_city.trim() : undefined;
      if (!originIn || !destIn) {
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_route_plan',
            error: 'origin_and_destination_required',
          }),
        };
      }
      if (mode === 'transit' && !transitCity) {
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_route_plan',
            error: 'transit_city_required_for_transit_mode',
          }),
        };
      }
      const o = await resolveToLngLat(key, originIn, geocodeCity);
      const d = await resolveToLngLat(key, destIn, geocodeCity);
      if (!o.ok) {
        warnAmapToolResult('amap_route_plan', { stage: 'origin_geocode', error: o.info, originIn });
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_route_plan',
            error: `origin_geocode:${o.info}`,
          }),
        };
      }
      if (!d.ok) {
        warnAmapToolResult('amap_route_plan', {
          stage: 'destination_geocode',
          error: d.info,
          destIn,
        });
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_route_plan',
            error: `destination_geocode:${d.info}`,
          }),
        };
      }
      const dir = await amapDirection(key, mode, o.location, d.location, transitCity);
      if (!dir.ok) {
        warnAmapToolResult('amap_route_plan', {
          stage: 'direction',
          error: dir.info,
          mode,
        });
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_route_plan',
            error: dir.info,
            origin_resolved: o.location,
            destination_resolved: d.location,
          }),
        };
      }
      const s = dir.summary;
      const polylineLlm = polylineForToolOutput(s.polyline);
      return {
        output: JSON.stringify({
          ok: true,
          _tool_name: 'amap_route_plan',
          mode: s.mode,
          origin_input: originIn,
          destination_input: destIn,
          origin_lnglat: o.location,
          destination_lnglat: d.location,
          distance_m: s.distance_m,
          duration_s: s.duration_s,
          steps_summary: s.steps_summary,
          polyline: polylineLlm,
          polyline_note:
            polylineLlm && s.polyline && polylineLlm.length < s.polyline.length
              ? 'polyline 已降采样/截断以控制上下文；静态图可仅用起终点调用 amap_route_static_map'
              : undefined,
          note: 'polyline 可传给 amap_route_static_map；也可用 amap_navigation_uri 生成网页链接',
        }),
        toolResultMeta: metaFor('amap_route_plan'),
      };
    },
  };

  const navUriTool: Tool = {
    name: 'amap_navigation_uri',
    description:
      '生成可在浏览器打开的高德导航链接（坐标模式）。需起点、终点与出行方式（drive/bus/walk/bike 对应驾车/公交/步行/骑行）。',
    parametersSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: '起点：地址或 经度,纬度' },
        destination: { type: 'string', description: '终点：地址或 经度,纬度' },
        mode: {
          type: 'string',
          enum: ['driving', 'walking', 'transit', 'bicycling'],
          description: '与 amap_route_plan 一致，会映射到 URI 的 mode',
        },
        geocode_city: { type: 'string', description: '地址解析时的城市提示' },
      },
      required: ['origin', 'destination', 'mode'],
    },
    async execute(argsJson): Promise<ToolExecuteResult> {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return {
          output: JSON.stringify({ ok: false, _tool_name: 'amap_navigation_uri', error: 'invalid_json' }),
        };
      }
      const originIn = typeof args.origin === 'string' ? args.origin.trim() : '';
      const destIn = typeof args.destination === 'string' ? args.destination.trim() : '';
      const mode = parseMode(args.mode);
      const geocodeCity = typeof args.geocode_city === 'string' ? args.geocode_city.trim() : undefined;
      if (!originIn || !destIn) {
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_navigation_uri',
            error: 'origin_and_destination_required',
          }),
        };
      }
      const o = await resolveToLngLat(key, originIn, geocodeCity);
      const d = await resolveToLngLat(key, destIn, geocodeCity);
      if (!o.ok) {
        warnAmapToolResult('amap_navigation_uri', { stage: 'origin_geocode', error: o.info, originIn });
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_navigation_uri',
            error: `origin:${o.info}`,
          }),
        };
      }
      if (!d.ok) {
        warnAmapToolResult('amap_navigation_uri', {
          stage: 'destination_geocode',
          error: d.info,
          destIn,
        });
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_navigation_uri',
            error: `destination:${d.info}`,
          }),
        };
      }
      const uriMode = routeModeToUriMode(mode);
      const url = buildAmapNavigationUri(o.location, d.location, uriMode);
      const md = `[高德导航·${mode}](${url})`;
      return {
        output: JSON.stringify({
          ok: true,
          _tool_name: 'amap_navigation_uri',
          navigation_url: url,
          markdown_link: md,
          origin_lnglat: o.location,
          destination_lnglat: d.location,
        }),
        toolResultMeta: metaFor('amap_navigation_uri', {
          items: [{ title: 'navigation', link: url }],
        }),
      };
    },
  };

  const staticMapTool: Tool = {
    name: 'amap_route_static_map',
    description:
      '生成路线静态图 URL（可嵌入 Markdown 图片）。需起点、终点；可选 polyline（来自 amap_route_plan），无则仅显示起终点连线。注意静态图有日配额，按需调用。',
    parametersSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: '起点：地址或 经度,纬度' },
        destination: { type: 'string', description: '终点：地址或 经度,纬度' },
        polyline: {
          type: 'string',
          description: '可选；amap_route_plan 返回的 polyline，可画完整路线',
        },
        geocode_city: { type: 'string', description: '地址解析时的城市提示' },
      },
      required: ['origin', 'destination'],
    },
    async execute(argsJson): Promise<ToolExecuteResult> {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return {
          output: JSON.stringify({ ok: false, _tool_name: 'amap_route_static_map', error: 'invalid_json' }),
        };
      }
      const originIn = typeof args.origin === 'string' ? args.origin.trim() : '';
      const destIn = typeof args.destination === 'string' ? args.destination.trim() : '';
      const polyline = typeof args.polyline === 'string' ? args.polyline.trim() : undefined;
      const geocodeCity = typeof args.geocode_city === 'string' ? args.geocode_city.trim() : undefined;
      if (!originIn || !destIn) {
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_route_static_map',
            error: 'origin_and_destination_required',
          }),
        };
      }
      const o = await resolveToLngLat(key, originIn, geocodeCity);
      const d = await resolveToLngLat(key, destIn, geocodeCity);
      if (!o.ok) {
        warnAmapToolResult('amap_route_static_map', { stage: 'origin_geocode', error: o.info, originIn });
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_route_static_map',
            error: `origin:${o.info}`,
          }),
        };
      }
      if (!d.ok) {
        warnAmapToolResult('amap_route_static_map', {
          stage: 'destination_geocode',
          error: d.info,
          destIn,
        });
        return {
          output: JSON.stringify({
            ok: false,
            _tool_name: 'amap_route_static_map',
            error: `destination:${d.info}`,
          }),
        };
      }
      const imgUrl = buildStaticMapUrl(key, o.location, d.location, polyline);
      const md = `![路线示意图（工具：amap_route_static_map）](${imgUrl})`;
      return {
        output: JSON.stringify({
          ok: true,
          _tool_name: 'amap_route_static_map',
          static_map_url: imgUrl,
          markdown_image: md,
          origin_lnglat: o.location,
          destination_lnglat: d.location,
        }),
        toolResultMeta: metaFor('amap_route_static_map', {
          items: [{ title: 'static_map', link: imgUrl }],
        }),
      };
    },
  };

  return [geocodeTool, routePlanTool, navUriTool, staticMapTool];
}
