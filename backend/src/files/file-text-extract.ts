import { strFromU8, unzipSync } from 'fflate';

export type FileExtractResult =
  | { mode: 'vectorize'; text: string }
  | { mode: 'metadata_only'; note: string }
  | { mode: 'error'; message: string };

const MAX_VECTOR_CHARS = 1_200_000;

function decodeUtf8(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8').decode(buffer);
  } catch {
    return '';
  }
}

/** 粗略从 PDF 字节流中提取可见字符串（无 pdf.js 依赖，复杂版式可能较差） */
function extractPdfRough(buffer: ArrayBuffer): string {
  const u8 = new Uint8Array(buffer);
  const chunk = u8.length > 6_000_000 ? u8.slice(0, 6_000_000) : u8;
  const latin = new TextDecoder('latin1').decode(chunk);
  const out: string[] = [];
  const re = /\((?:\\.|[^\\)])*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) !== null) {
    const inner = m[0].slice(1, -1).replace(/\\([\\nrtbf()])/g, (_, ch: string) => {
      if (ch === 'n') return '\n';
      if (ch === 'r') return '\r';
      if (ch === 't') return '\t';
      return ch;
    });
    const t = inner.trim();
    if (t.length > 1 && /[\p{L}\p{N}\u4e00-\u9fff]/u.test(t)) {
      out.push(t);
    }
  }
  const joined = out.join(' ').replace(/\s+/g, ' ').trim();
  if (joined.length > 80) {
    return joined.slice(0, MAX_VECTOR_CHARS);
  }
  const fallback = latin
    .replace(/[^\x20-\x7e\u4e00-\u9fff\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return fallback.slice(0, MAX_VECTOR_CHARS);
}

function extractDocx(buffer: ArrayBuffer): string {
  const z = unzipSync(new Uint8Array(buffer));
  const doc = z['word/document.xml'];
  if (!doc) {
    throw new Error('docx 缺少 word/document.xml');
  }
  const xml = strFromU8(doc);
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractXlsxRough(buffer: ArrayBuffer, maxChars: number): string {
  const z = unzipSync(new Uint8Array(buffer));
  const blobs: string[] = [];
  for (const [name, data] of Object.entries(z)) {
    if (!name.endsWith('.xml')) continue;
    if (name.includes('sharedStrings') || /worksheets\/sheet\d+\.xml$/.test(name)) {
      blobs.push(strFromU8(data));
    }
  }
  let text = blobs.join('\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}…`;
  }
  return text;
}

function isMostlyPrintable(s: string, sample = 4000): boolean {
  const slice = s.slice(0, sample);
  if (!slice.length) return false;
  let printable = 0;
  for (let i = 0; i < slice.length; i++) {
    const c = slice.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 0x7f) || (c >= 0x4e00 && c <= 0x9fff)) {
      printable++;
    }
  }
  return printable / slice.length > 0.88;
}

export type ExtractOptions = {
  /** Excel 类提取的最大字符数（由 FILE_EXCEL_MAX_ROWS 等推导） */
  excelMaxChars: number;
};

/**
 * 按技术方案 §4.5：可向量化的文本 / 仅元数据 / 解析失败。
 */
export function extractFileText(
  buffer: ArrayBuffer,
  mimeType: string,
  originalName: string,
  opts: ExtractOptions,
): FileExtractResult {
  const mime = (mimeType || 'application/octet-stream').split(';')[0]!.trim().toLowerCase();
  const nameLower = originalName.toLowerCase();

  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') {
    const text = decodeUtf8(buffer).trim();
    if (!text.length) {
      return { mode: 'metadata_only', note: '空文本' };
    }
    return { mode: 'vectorize', text: text.slice(0, MAX_VECTOR_CHARS) };
  }

  if (!mime.startsWith('text/') && nameLower.endsWith('.md')) {
    const text = decodeUtf8(buffer).trim();
    if (!text.length) {
      return { mode: 'metadata_only', note: '空 markdown' };
    }
    return { mode: 'vectorize', text: text.slice(0, MAX_VECTOR_CHARS) };
  }

  if (mime === 'application/pdf' || nameLower.endsWith('.pdf')) {
    try {
      const text = extractPdfRough(buffer);
      if (text.length < 40) {
        return { mode: 'error', message: 'PDF 文本提取过少，可能为扫描件' };
      }
      return { mode: 'vectorize', text };
    } catch (e) {
      return { mode: 'error', message: e instanceof Error ? e.message : 'PDF 解析失败' };
    }
  }

  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    nameLower.endsWith('.docx')
  ) {
    try {
      const text = extractDocx(buffer);
      if (text.length < 20) {
        return { mode: 'error', message: 'Word 文档无可用文本' };
      }
      return { mode: 'vectorize', text: text.slice(0, MAX_VECTOR_CHARS) };
    } catch (e) {
      return { mode: 'error', message: e instanceof Error ? e.message : 'docx 解析失败' };
    }
  }

  if (mime === 'application/msword' || nameLower.endsWith('.doc')) {
    return { mode: 'metadata_only', note: '旧版 .doc 未做解析，仅保存文件' };
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    nameLower.endsWith('.xlsx') ||
    nameLower.endsWith('.xls')
  ) {
    if (nameLower.endsWith('.xls') && mime !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      return { mode: 'error', message: '旧版 .xls 未支持，请导出为 xlsx' };
    }
    try {
      const text = extractXlsxRough(buffer, opts.excelMaxChars);
      if (text.length < 15) {
        return { mode: 'error', message: '表格几乎无文本可提取' };
      }
      return { mode: 'vectorize', text: text.slice(0, MAX_VECTOR_CHARS) };
    } catch (e) {
      return { mode: 'error', message: e instanceof Error ? e.message : 'xlsx 解析失败' };
    }
  }

  if (mime.startsWith('image/')) {
    return { mode: 'metadata_only', note: '图片未启用 OCR，不向量化' };
  }

  if (mime.startsWith('audio/') || mime.startsWith('video/')) {
    return { mode: 'metadata_only', note: '音视频不向量化，仅存元数据' };
  }

  const guessed = decodeUtf8(buffer);
  if (guessed.length > 80 && isMostlyPrintable(guessed)) {
    return { mode: 'vectorize', text: guessed.slice(0, MAX_VECTOR_CHARS) };
  }

  return { mode: 'metadata_only', note: '不支持的类型或未识别为可读文本，仅存文件' };
}

export function excelCharBudgetFromEnv(raw: string | undefined): number {
  const rows = raw?.trim() ? Number.parseInt(raw, 10) : NaN;
  const base = Number.isFinite(rows) && rows > 0 ? rows * 240 : 120_000;
  return Math.min(Math.max(base, 8_000), 500_000);
}
