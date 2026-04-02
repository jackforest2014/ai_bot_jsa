/**
 * Cloudflare Pages Function — proxy all /api/* requests to the backend Worker.
 *
 * This is the production equivalent of the Vite dev server proxy in vite.config.ts.
 * The Worker URL is configured via the BACKEND_ORIGIN environment variable
 * (set in Cloudflare Pages dashboard → Settings → Environment variables).
 *
 * Example: BACKEND_ORIGIN = https://ai-task-assistant.your-subdomain.workers.dev
 */

interface Env {
  BACKEND_ORIGIN: string
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const backendOrigin = env.BACKEND_ORIGIN
  if (!backendOrigin) {
    return new Response(
      JSON.stringify({ error: 'BACKEND_ORIGIN not configured' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Build the backend URL: keep the original path and query string
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, backendOrigin)

  // Forward the request, preserving method, headers, and body
  const headers = new Headers(request.headers)
  // Let the backend see the real origin for CORS
  headers.set('X-Forwarded-Host', url.host)

  const init: RequestInit = {
    method: request.method,
    headers,
  }

  // Only attach body for methods that support it
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request.body
  }

  const response = await fetch(target.toString(), init)

  // Return the backend response, stripping hop-by-hop headers
  const respHeaders = new Headers(response.headers)
  // Ensure browser sees correct CORS origin (the Pages domain)
  respHeaders.set('Access-Control-Allow-Origin', url.origin)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
  })
}
