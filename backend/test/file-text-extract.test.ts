import { describe, it, expect } from 'vitest';
import { extractFileText } from '../src/files/file-text-extract';

describe('extractFileText', () => {
  it('extracts plain text', () => {
    const buf = new TextEncoder().encode('hello 世界').buffer as ArrayBuffer;
    const r = extractFileText(buf, 'text/plain', 'a.txt', { excelMaxChars: 10_000 });
    expect(r.mode).toBe('vectorize');
    if (r.mode === 'vectorize') expect(r.text).toContain('hello');
  });

  it('metadata_only for image', () => {
    const buf = new ArrayBuffer(8);
    const r = extractFileText(buf, 'image/png', 'x.png', { excelMaxChars: 10_000 });
    expect(r.mode).toBe('metadata_only');
  });

  it('pdf heuristic finds parenthesized string', () => {
    const inner = 'HelloFromPdfTest '.repeat(5).trim();
    const pdfLike = new TextEncoder().encode(`%PDF-1.4\n(${inner})`).buffer as ArrayBuffer;
    const r = extractFileText(pdfLike, 'application/pdf', 'f.pdf', { excelMaxChars: 10_000 });
    expect(r.mode).toBe('vectorize');
    if (r.mode === 'vectorize') expect(r.text).toMatch(/HelloFromPdfTest/i);
  });
});
