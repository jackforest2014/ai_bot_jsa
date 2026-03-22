import { describe, it, expect } from 'vitest';
import {
  parseSearchImagesAllowlistFromToolJson,
  sanitizeMarkdownImagesToAllowlist,
} from '../src/chat/sanitize-web-search-images';

describe('sanitize-web-search-images', () => {
  it('parseSearchImagesAllowlistFromToolJson collects image_url', () => {
    const json = JSON.stringify({
      ok: true,
      type: 'images',
      items: [{ title: 'a', image_url: 'https://cdn.example/a.jpg' }, { title: 'b', link: 'x' }],
    });
    expect(parseSearchImagesAllowlistFromToolJson(json)).toEqual(['https://cdn.example/a.jpg']);
  });

  it('parse returns null for non-images', () => {
    expect(parseSearchImagesAllowlistFromToolJson('{"ok":true,"type":"organic"}')).toBeNull();
  });

  it('parse returns [] for failed images-shaped response', () => {
    expect(parseSearchImagesAllowlistFromToolJson('{"ok":false,"type":"images"}')).toEqual([]);
  });

  it('sanitizeMarkdownImagesToAllowlist removes images not in allowlist', () => {
    const text =
      '前言\n\n![bad](https://www.xinhuanet.com/fake.jpg)\n\n![ok](https://allow.ed/j.png)尾';
    const out = sanitizeMarkdownImagesToAllowlist(text, ['https://allow.ed/j.png']);
    expect(out).not.toContain('xinhuanet');
    expect(out).toContain('https://allow.ed/j.png');
  });
});
