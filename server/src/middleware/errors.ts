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

  // Anything unexpected is logged in full but reported generically, so internal
  // details (SQL, file paths, secrets) never reach the browser.
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
