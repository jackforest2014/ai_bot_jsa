/** 业务/API 可识别的错误基类 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      code: string;
      statusCode: number;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'VALIDATION_ERROR', statusCode: 400, details });
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, options?: { details?: unknown; cause?: unknown }) {
    super(message, {
      code: 'DATABASE_ERROR',
      statusCode: 500,
      details: options?.details,
      cause: options?.cause,
    });
    this.name = 'DatabaseError';
  }
}

export class LLMError extends AppError {
  constructor(message: string, options?: { details?: unknown; cause?: unknown }) {
    super(message, {
      code: 'LLM_ERROR',
      statusCode: 502,
      details: options?.details,
      cause: options?.cause,
    });
    this.name = 'LLMError';
  }
}

/** 单文件超过上限（如 PRD 64MB） */
export class FileSizeError extends AppError {
  constructor(
    message: string,
    public readonly maxBytes: number,
    public readonly actualBytes?: number,
  ) {
    super(message, {
      code: 'FILE_SIZE_ERROR',
      statusCode: 413,
      details: { max_bytes: maxBytes, actual_bytes: actualBytes },
    });
    this.name = 'FileSizeError';
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
