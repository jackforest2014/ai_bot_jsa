/**
 * Cloudflare Workers：把全局 `fetch` 赋给字段再以 `fn(url)` 调用会触发
 * 「Illegal invocation: incorrect this」；经包装后始终委托给 `globalThis`。
 */
export function workerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init);
}
