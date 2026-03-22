export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Worker 内仅 console；本地全量落盘请用 `npm run dev:log`（tee 到 `backend/ai.log`）。 */

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...meta,
  };
  const line = JSON.stringify(payload);
  switch (level) {
    case 'debug':
    case 'info':
      console.log(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
    default:
      console.log(line);
  }
}

/** Worker 友好：单行 JSON，便于 `wrangler tail` 过滤 */
export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};
