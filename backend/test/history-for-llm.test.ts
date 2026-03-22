import { describe, it, expect } from 'vitest';
import type { ConversationRow } from '../src/db';
import { conversationRowsToLlmMessages } from '../src/chat/history-for-llm';

function row(
  partial: Partial<ConversationRow> & Pick<ConversationRow, 'id' | 'role' | 'content' | 'created_at'>,
): ConversationRow {
  return {
    user_id: 'u1',
    session_id: 's1',
    intention: null,
    prompt_id: null,
    keywords: null,
    conversation_id: null,
    ...partial,
  };
}

describe('conversationRowsToLlmMessages (time decay)', () => {
  it('keeps full text for small batches (all in tail)', () => {
    const long = 'x'.repeat(2000);
    const rows: ConversationRow[] = [
      row({ id: '1', role: 'user', content: 'u', created_at: 1 }),
      row({ id: '2', role: 'assistant', content: long, created_at: 2 }),
    ];
    const msgs = conversationRowsToLlmMessages(rows, 'default');
    expect(msgs[1]?.content).toBe(long);
  });

  it('hard-folds rows outside tail when far behind newest (default intent)', () => {
    const newest = 1_010_000;
    const longOld = '路线详情'.repeat(200);
    const rows: ConversationRow[] = [
      row({
        id: 'r1',
        role: 'user',
        content: '怎么去机场',
        intention: 'route_query',
        created_at: newest - 5000,
      }),
      row({
        id: 'r2',
        role: 'assistant',
        content: longOld,
        intention: 'route_query',
        created_at: newest - 4999,
      }),
    ];
    for (let i = 0; i < 6; i++) {
      const t = newest - 200 + i * 2;
      rows.push(
        row({ id: `mu${i}`, role: 'user', content: '.', intention: 'default', created_at: t }),
        row({ id: `ma${i}`, role: 'assistant', content: '.', intention: 'default', created_at: t + 1 }),
      );
    }
    for (let i = 0; i < 4; i++) {
      const t = newest - 8 + i * 2;
      rows.push(
        row({ id: `tu${i}`, role: 'user', content: `tail${i}`, intention: 'default', created_at: t }),
        row({
          id: `ta${i}`,
          role: 'assistant',
          content: `rep${i}`,
          intention: 'default',
          created_at: i === 3 ? newest : t + 1,
        }),
      );
    }
    expect(rows.length).toBe(22);
    expect(Math.max(...rows.map((r) => r.created_at))).toBe(newest);

    const msgs = conversationRowsToLlmMessages(rows, 'default');
    const folded = msgs.find((m) => m.content.includes('已按时间折叠'));
    expect(folded).toBeDefined();
    expect(folded?.content).not.toContain('路线详情');
  });

  it('soft-truncates outside tail when moderately stale', () => {
    const base = 500_000;
    const longMid = 'M'.repeat(800);
    const rows: ConversationRow[] = [];
    rows.push(
      row({
        id: 'old_u',
        role: 'user',
        content: longMid,
        created_at: base,
      }),
    );
    for (let k = 0; k < 11; k++) {
      rows.push(
        row({
          id: `u${k}`,
          role: 'user',
          content: `x${k}`,
          created_at: base + 1000 + k * 2,
        }),
        row({
          id: `a${k}`,
          role: 'assistant',
          content: `y${k}`,
          created_at: base + 1001 + k * 2,
        }),
      );
    }
    const msgs = conversationRowsToLlmMessages(rows, 'default');
    const first = msgs[0];
    expect(first?.content.length).toBeLessThan(longMid.length);
    expect(first?.content).toContain('已按时间截断');
  });

  it('relaxes thresholds for route_query (hard fold becomes truncate)', () => {
    const newest = 100_000;
    const longOld = 'R'.repeat(900);
    const rows: ConversationRow[] = [];
    rows.push(
      row({
        id: 'old',
        role: 'assistant',
        content: longOld,
        created_at: newest - 7000,
        intention: 'route_query',
      }),
    );
    for (let k = 0; k < 11; k++) {
      rows.push(
        row({
          id: `u${k}`,
          role: 'user',
          content: `u${k}`,
          created_at: newest - 3000 + k * 10,
        }),
        row({
          id: `a${k}`,
          role: 'assistant',
          content: `a${k}`,
          created_at: newest - 2999 + k * 10,
        }),
      );
    }
    const msgsRoute = conversationRowsToLlmMessages(rows, 'route_query');
    const firstR = msgsRoute[0]?.content ?? '';
    expect(firstR).toContain('已按时间截断');
    expect(firstR).not.toContain('已按时间折叠');

    const msgsDefault = conversationRowsToLlmMessages(rows, 'default');
    const firstD = msgsDefault[0]?.content ?? '';
    expect(firstD).toContain('已按时间折叠');
  });
});
