/**
 * Thin HTTP client for the backend.
 *
 * Authentication is carried entirely by the session cookie the server sets
 * (`httpOnly`, `sameSite=lax`, `secure` in production). `credentials: 'include'`
 * makes the browser attach it. Nothing here — or anywhere else in the app —
 * reads, writes or stores a token in localStorage: `httpOnly` means JavaScript
 * cannot see the cookie at all, which is the point.
 */

const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '/api';

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Pull `{ error: "..." }` out of a response body, whatever shape it arrived in. */
function readError(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === 'string' && value) return value;
  }
  return FALLBACK_ERROR;
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // Network-level failure: the request never reached the server.
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(response.status, readError(payload));
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, 'GET'),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body),
  put: <T>(path: string, body?: unknown) => request<T>(path, 'PUT', body),
  patch: <T>(path: string, body?: unknown) => request<T>(path, 'PATCH', body),
  delete: <T>(path: string) => request<T>(path, 'DELETE'),
};

/** Turn any thrown value into something worth showing a person. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return FALLBACK_ERROR;
}