import type { ZodError } from 'zod';

export function zodIssues(e: ZodError): { path: string; message: string }[] {
  return e.issues.map((i) => ({
    path: i.path.join('.') || '(root)',
    message: i.message,
  }));
}
