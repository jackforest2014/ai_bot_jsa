import { describe, it, expect } from 'vitest';
import { RuleBasedIntentClassifier } from '../src/intent/intent-classifier';
import {
  mergeTaskMutationStateAfterExecute,
  resolveTaskMutationSignal,
} from '../src/chat/task-mutation-intent';

describe('resolveTaskMutationSignal', () => {
  it('forces when intent is task_operation', () => {
    const r = resolveTaskMutationSignal('列出我的任务', 'task_operation');
    expect(r).toEqual({ force: true, reason: 'intent_task_operation' });
  });

  it('forces on keyword when intent is default (苏州行程)', () => {
    const r = resolveTaskMutationSignal(
      '我下周三要去一趟苏州，拜访一下那边园林方面的老师傅，需要在那边待两天。',
      'default',
    );
    expect(r.force).toBe(true);
    expect(r.reason).toBe('keyword');
  });

  it('does not force on pure route_query', () => {
    const r = resolveTaskMutationSignal('从苏州站到拙政园怎么走', 'route_query');
    expect(r.force).toBe(false);
  });

  it('forces on route_query when same sentence mixes meeting time and 路线/规划', () => {
    const r = resolveTaskMutationSignal(
      '去拙政园，下午2点见面，你帮我规划一下行程路线。',
      'route_query',
    );
    expect(r.force).toBe(true);
    expect(r.reason).toBe('keyword');
  });

  it('does not force on chit-chat', () => {
    expect(resolveTaskMutationSignal('苏州园林真美', 'default').force).toBe(false);
  });
});

describe('mergeTaskMutationStateAfterExecute', () => {
  const empty = { calendarPrimed: false, writeDone: false };

  it('sets calendarPrimed after successful resolve_shanghai_calendar', () => {
    const next = mergeTaskMutationStateAfterExecute(empty, [{ name: 'resolve_shanghai_calendar' }], [
      { output: JSON.stringify({ ok: true, resolved: [] }) },
    ]);
    expect(next).toEqual({ calendarPrimed: true, writeDone: false });
  });

  it('sets writeDone after successful add_task', () => {
    const next = mergeTaskMutationStateAfterExecute(empty, [{ name: 'add_task' }], [
      { output: JSON.stringify({ ok: true, task: { id: 't1' } }) },
    ]);
    expect(next).toEqual({ calendarPrimed: false, writeDone: true });
  });

  it('accumulates calendar then write across calls', () => {
    let s = empty;
    s = mergeTaskMutationStateAfterExecute(s, [{ name: 'resolve_shanghai_calendar' }], [
      { output: JSON.stringify({ ok: true, resolved: [] }) },
    ]);
    expect(s.writeDone).toBe(false);
    s = mergeTaskMutationStateAfterExecute(s, [{ name: 'add_task' }], [
      { output: JSON.stringify({ ok: true, task: { id: 't1' } }) },
    ]);
    expect(s).toEqual({ calendarPrimed: true, writeDone: true });
  });
});

describe('RuleBasedIntentClassifier vs greeting+task', () => {
  const clf = new RuleBasedIntentClassifier();

  it('prefers task_operation when 你好 + 明天打电话', async () => {
    expect(await clf.classify('你好，我明天要给中建公司的李总打个电话。')).toBe('task_operation');
  });

  it('still greets on short hello', async () => {
    expect(await clf.classify('你好')).toBe('greeting');
  });

  it('classifies N号 + 去一趟 as task_operation before route', async () => {
    expect(
      await clf.classify('25号要去一趟苏州，和那边园林相关的师傅见个面。'),
    ).toBe('task_operation');
  });
});
