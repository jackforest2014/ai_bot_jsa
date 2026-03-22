import { z } from 'zod';

export const chatStreamBodySchema = z.object({
  message: z.string().transform((s) => s.trim()).pipe(z.string().min(1, 'message 不能为空')),
  session_id: z.string().transform((s) => s.trim()).pipe(z.string().min(1, 'session_id 不能为空')),
});

export const initiateMultipartBodySchema = z.object({
  filename: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
  original_name: z.string().transform((s) => s.trim()).optional(),
  mime_type: z
    .union([z.string(), z.undefined(), z.null()])
    .transform((s) => (typeof s === 'string' && s.trim() ? s.trim() : 'application/octet-stream')),
  size: z.number().finite().positive(),
  semantic_type: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((s) => {
      if (s === null || s === undefined) return null;
      const t = s.trim();
      return t || null;
    }),
  folder_path: z.union([z.string(), z.undefined()]).transform((s) => (typeof s === 'string' ? s : '')),
  tags: z
    .union([z.array(z.string()), z.undefined()])
    .transform((t) => (Array.isArray(t) ? t.map((x) => x.trim()).filter(Boolean) : [])),
});

export const completeMultipartBodySchema = z.object({
  upload_id: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
  r2_key: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
  parts: z.array(
    z.object({
      etag: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
      partNumber: z.number().finite().int().positive(),
    }),
  ),
  original_name: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
  mime_type: z
    .union([z.string(), z.undefined(), z.null()])
    .transform((s) => (typeof s === 'string' && s.trim() ? s.trim() : 'application/octet-stream')),
  size: z.number().finite().positive(),
  semantic_type: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((s) => {
      if (s === null || s === undefined) return null;
      const t = s.trim();
      return t || null;
    }),
  folder_path: z.union([z.string(), z.undefined()]).transform((s) => (typeof s === 'string' ? s : '')),
  tags: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((t) =>
      Array.isArray(t) ? t.map((x) => String(x).trim()).filter(Boolean) : null,
    ),
});

export const fileRenameBodySchema = z.object({
  new_name: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
});

export const fileSemanticTypeBodySchema = z.object({
  semantic_type: z
    .union([z.string(), z.null()])
    .transform((v) => {
      if (v === null) return null;
      const t = v.trim();
      return t === '' ? null : t;
    }),
});

export const fileTagsBodySchema = z.object({
  tags: z
    .array(z.union([z.string(), z.number()]))
    .transform((arr) => arr.map((x) => String(x).trim()).filter(Boolean)),
});

export const promptCreateBodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
  template_text: z.string().min(1),
  scenario: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
});

export const promptUpdateBodySchema = z
  .object({
    name: z.string().transform((s) => s.trim()).pipe(z.string().min(1)).optional(),
    template_text: z.string().min(1).optional(),
    scenario: z.string().transform((s) => s.trim()).pipe(z.string().min(1)).optional(),
  })
  .refine((o) => o.name !== undefined || o.template_text !== undefined || o.scenario !== undefined, {
    message: '至少提供一个可更新字段',
  });
