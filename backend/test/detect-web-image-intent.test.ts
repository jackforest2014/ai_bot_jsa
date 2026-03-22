import { describe, it, expect } from 'vitest';
import { wantsWebImageSearch } from '../src/chat/detect-web-image-intent';

describe('wantsWebImageSearch', () => {
  it('matches typical user phrasing', () => {
    expect(
      wantsWebImageSearch(
        '帮我在网上找一张2026年春节烟花的图片，然后嵌入到你的回答中，我不想点击链接。',
      ),
    ).toBe(true);
  });

  it('does not match vague mention of images', () => {
    expect(wantsWebImageSearch('这个图表是什么意思')).toBe(false);
    expect(wantsWebImageSearch('附件里有一张图')).toBe(false);
  });

  it('matches search + image without 网上', () => {
    expect(wantsWebImageSearch('搜索几张猫的图片给我')).toBe(true);
  });

  it('matches follow-up 再找两张 without 图字', () => {
    expect(wantsWebImageSearch('可以再找两张吗？2025年和2026年的都可以。')).toBe(true);
  });

  it('matches follow-up 换一张 when 图片 present', () => {
    expect(
      wantsWebImageSearch('"2025年除夕实拍"的图片没显示出来，请换一张。'),
    ).toBe(true);
  });

  it('does not match 换一张车票', () => {
    expect(wantsWebImageSearch('帮我换一张车票')).toBe(false);
  });

  it('matches 整理图文介绍 + 明确张数（未说网上）', () => {
    expect(
      wantsWebImageSearch(
        '关于山茶，请整理一篇有图片和文字的介绍，图片在2到3张，文字不超过100字。',
      ),
    ).toBe(true);
  });

  it('does not match 写自我介绍 without image count', () => {
    expect(wantsWebImageSearch('帮我写一篇自我介绍，纯文字就行')).toBe(false);
  });
});
