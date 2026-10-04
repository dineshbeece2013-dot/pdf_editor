import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for values that must be stored but never served —
 * currently the Razorpay key secret.
 *
 * AES-256-GCM in a `iv.tag.ciphertext` envelope. GCM's tag means a tampered
 * row fails to decrypt instead of silently returning garbage.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

function toKey(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error(`Encryption key must decode to ${KEY_BYTES} bytes (64 hex characters).`);
  }
  return key;
}

export function encryptSecret(plaintext: string, hexKey: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, toKey(hexKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptSecret(envelope: string, hexKey: string): string {
  const parts = envelope.split('.');
  if (parts.length !== 3) throw new Error('Malformed secret envelope.');
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, toKey(hexKey), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
