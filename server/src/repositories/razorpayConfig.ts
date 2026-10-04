import type { Queryable } from '../db/index.js';
import type { AppConfig } from '../config.js';
import { encryptSecret, decryptSecret } from '../security/secret-box.js';

/**
 * Gateway configuration with the secret encrypted at rest.
 *
 * Resolution order: a row in PostgreSQL (written by an admin through the
 * dashboard) wins over the environment variables. The secret is decrypted
 * only inside this module and is never included in any response.
 */

export interface GatewayConfig {
  keyId: string;
  /** Null when no secret is configured. */
  keySecret: string | null;
  currency: string;
  source: 'database' | 'environment' | 'unconfigured';
}

export interface PublicGatewayConfig {
  keyId: string;
  currency: string;
  /** Tells the admin UI a secret exists without revealing it. */
  hasSecret: boolean;
  isConfigured: boolean;
}

interface GatewayRow {
  key_id: string | null;
  key_secret_enc: string | null;
  currency: string | null;
}

export async function loadGatewayConfig(db: Queryable, config: AppConfig): Promise<GatewayConfig> {
  const { rows } = await db.query<GatewayRow>(
    'SELECT key_id, key_secret_enc, currency FROM razorpay_config WHERE id = 1',
  );
  const row = rows[0];

  if (row && row.key_id) {
    let keySecret: string | null = null;
    if (row.key_secret_enc) {
      try {
        keySecret = decryptSecret(row.key_secret_enc, config.razorpayEncryptionKey);
      } catch (err) {
        // Most likely RAZORPAY_ENCRYPTION_KEY was rotated. Surface it loudly
        // rather than silently falling back to a broken checkout.
        throw new Error(
          `Unable to decrypt the stored Razorpay secret: ${err instanceof Error ? err.message : 'unknown error'}. ` +
            'Re-enter the secret in the admin dashboard, or set RAZORPAY_ENCRYPTION_KEY back to its original value.',
        );
      }
    }
    return {
      keyId: row.key_id,
      keySecret,
      currency: row.currency || config.razorpay.currency,
      source: 'database',
    };
  }

  if (config.razorpay.keyId) {
    return {
      keyId: config.razorpay.keyId,
      keySecret: config.razorpay.keySecret || null,
      currency: config.razorpay.currency,
      source: 'environment',
    };
  }

  return { keyId: '', keySecret: null, currency: config.razorpay.currency, source: 'unconfigured' };
}

/** The only shape allowed out of this module — `keySecret` is not in it. */
export function toPublicGatewayConfig(gateway: GatewayConfig): PublicGatewayConfig {
  return {
    keyId: gateway.keyId,
    currency: gateway.currency,
    hasSecret: !!gateway.keySecret,
    isConfigured: !!gateway.keyId && !!gateway.keySecret,
  };
}

export interface GatewayPatch {
  keyId?: string;
  /** Omitted or empty leaves the stored secret untouched. */
  keySecret?: string;
  currency?: string;
}

export async function saveGatewayConfig(
  db: Queryable,
  config: AppConfig,
  patch: GatewayPatch,
): Promise<void> {
  const { rows } = await db.query<GatewayRow>(
    'SELECT key_id, key_secret_enc, currency FROM razorpay_config WHERE id = 1',
  );
  const existing = rows[0] ?? { key_id: null, key_secret_enc: null, currency: null };

  const keyId = patch.keyId !== undefined ? patch.keyId.trim() : (existing.key_id ?? '');
  const currency = patch.currency !== undefined ? patch.currency.trim() : (existing.currency ?? config.razorpay.currency);

  // An empty keySecret field in the form means "leave it alone" — the admin UI
  // never receives the current secret, so it cannot echo it back.
  let secretCipher: string | null = existing.key_secret_enc;
  if (patch.keySecret !== undefined && patch.keySecret.trim() !== '') {
    secretCipher = encryptSecret(patch.keySecret.trim(), config.razorpayEncryptionKey);
  }

  await db.query(
    `INSERT INTO razorpay_config (id, key_id, key_secret_enc, currency, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE
       SET key_id = EXCLUDED.key_id,
           key_secret_enc = EXCLUDED.key_secret_enc,
           currency = EXCLUDED.currency,
           updated_at = now()`,
    [keyId || null, secretCipher, currency],
  );
}
