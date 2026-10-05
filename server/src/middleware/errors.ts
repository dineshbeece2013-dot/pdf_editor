import type { NextFunction, Request, Response } from 'express';

/** An error carrying the HTTP status the client should see. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found.' });
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

/**
 * Errors raised by body-parser when it refuses a request body. These are the
 * client's fault, so they get their real 4xx status and a short fixed message
 * instead of being logged as unhandled server faults.
 */
const BODY_ERRORS: Record<string, { status: number; error: string }> = {
  'entity.parse.failed': { status: 400, error: 'Malformed request body.' },
  'entity.verify.failed': { status: 400, error: 'Malformed request body.' },
  'entity.too.large': { status: 413, error: 'Request body is too large.' },
  'encoding.unsupported': { status: 415, error: 'Unsupported content type.' },
  'charset.unsupported': { status: 415, error: 'Unsupported content type.' },
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const code = (err as { code?: string } | null)?.code;
  if (code === UNIQUE_VIOLATION) {
    res.status(409).json({ error: 'That email is already registered.' });
    return;
  }

  // body-parser/http-errors label these with `type`; raw-body and pg use `code`.
  const bodyError = BODY_ERRORS[code ?? (err as { type?: string } | null)?.type ?? ''];
  if (bodyError) {
    res.status(bodyError.status).json({ error: bodyError.error });
    return;
  }

  // Anything unexpected is logged in full but reported generically, so internal
  // details (SQL, file paths, secrets) never reach the browser.
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
