import type { MemoryService } from '../memory/memory-service';
import type { MemoryAddMetadata } from '../memory/memory-service';
import { excelCharBudgetFromEnv, extractFileText, type FileExtractResult } from './file-text-extract';
import type { FileUploadRow } from '../db';

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;

export function chunkTextForEmbedding(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const t = text.replace(/\r\n/g, '\n').trim();
  if (!t) return [];

  const chunks: string[] = [];
  let i = 0;
  const step = Math.max(size - overlap, 64);
  while (i < t.length) {
    const piece = t.slice(i, i + size).trim();
    if (piece.length > 24) {
      chunks.push(piece);
    }
    i += step;
  }

  if (!chunks.length && t.length) {
    chunks.push(t.slice(0, size));
  }
  return chunks;
}

function parseTags(raw: string | null): string[] | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return undefined;
    const tags = p.map((x) => String(x).trim()).filter(Boolean);
    return tags.length ? tags : undefined;
  } catch {
    return undefined;
  }
}

export async function vectorizeFileIntoMemory(
  memory: MemoryService,
  text: string,
  userId: string,
  row: FileUploadRow,
): Promise<void> {
  const meta: MemoryAddMetadata = {
    file_id: row.id,
    filename: row.original_name,
    semantic_type: row.semantic_type ?? undefined,
    folder_path: row.folder_path?.trim() || undefined,
    tags: parseTags(row.tags),
  };

  const chunks = chunkTextForEmbedding(text);
  for (const chunk of chunks) {
    await memory.addToMemory(chunk, userId, 'document', meta);
  }
}

export type FileIngestEnvSlice = {
  FILE_EXCEL_MAX_ROWS?: string;
};

export function extractForIngest(
  buffer: ArrayBuffer,
  row: FileUploadRow,
  env: FileIngestEnvSlice,
): FileExtractResult {
  return extractFileText(buffer, row.mime_type, row.original_name, {
    excelMaxChars: excelCharBudgetFromEnv(env.FILE_EXCEL_MAX_ROWS),
  });
}
