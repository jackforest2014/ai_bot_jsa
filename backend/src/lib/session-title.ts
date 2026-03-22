/** 会话自动标题最大长度（字/码点级截断） */
export const SESSION_TITLE_MAX_LEN = 30;

export function clampSessionTitle(s: string): string {
  const t = (s ?? '')
    .trim()
    .replace(/^[\s"'「『【]+|[\s"'」』】。.!！?？,，、;；:]+$/g, '');
  return Array.from(t).slice(0, SESSION_TITLE_MAX_LEN).join('');
}
