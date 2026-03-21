/** 与技术方案 §5.1 SSE 事件格式一致 */

export function encodeSseEvent(event: string, payload: unknown): string {
  const data = JSON.stringify(payload);
  return `event: ${event}\ndata: ${data}\n\n`;
}
