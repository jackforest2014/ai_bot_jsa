import { describe, it, expect } from 'vitest';
import { RuleBasedIntentClassifier } from '../src/intent/intent-classifier';

describe('RuleBasedIntentClassifier', () => {
  const clf = new RuleBasedIntentClassifier();

  it('classifies research', async () => {
    expect(await clf.classify('请深度研究量子计算')).toBe('research');
  });

  it('file_upload before workspace_operation', async () => {
    expect(await clf.classify('上传文件到工作空间')).toBe('file_upload');
  });

  it('workspace_operation', async () => {
    expect(await clf.classify('把工作空间里那个文件重命名')).toBe('workspace_operation');
  });

  it('defaults', async () => {
    expect(await clf.classify('随便聊聊')).toBe('default');
    expect(await clf.classify('')).toBe('default');
  });
});
