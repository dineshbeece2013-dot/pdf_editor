import { argon2id, hash, verify, type HashOptions } from 'argon2';
import { randomBytes } from 'node:crypto';

/**
 * Argon2id with the OWASP-recommended parameters (19 MiB, 2 passes, 1 lane).
 * Every password that reaches the database goes through `hashPassword`, so a
 * plaintext password is never persisted, logged or returned by any API.
 */
const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/** Password policy enforced on the server. The login form mirrors these numbers. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

/** Never throws: a malformed stored hash is treated as a failed verification. */
export async function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext);
  } catch {
    return false;
  }
}

/**
 * A decoy hash of a random secret, computed lazily and only ever used when the
 * submitted email has no account. Spending the same Argon2 time in that case
 * stops response timing from revealing which emails are registered.
 */
let decoyHash: Promise<string> | null = null;

function getDecoyHash(): Promise<string> {
  if (!decoyHash) {
    decoyHash = hash(randomBytes(32).toString('hex'), ARGON2_OPTIONS);
  }
  return decoyHash;
}

export async function burnVerificationTime(plaintext: string): Promise<void> {
  await verifyPassword(await getDecoyHash(), plaintext);
}
