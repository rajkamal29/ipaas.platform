/**
 * Load/save a tenant's per-provider credentials.
 *
 * One row per (tenant_id, provider) — not per source/target role, and not
 * per sync_requests row (see docs/migrations/README.md). An adapter always
 * looks itself up by its own fixed provider name plus whatever tenantId
 * it was constructed with.
 */
const { pool } = require('./db');
const { encryptPayload, decryptPayload } = require('./crypto');

/**
 * Returns the decrypted credential payload for (tenantId, provider), or
 * null if no row exists yet.
 */
async function loadCredentials(tenantId, provider) {
  const { rows } = await pool.query(
    'SELECT encrypted_payload, iv, auth_tag FROM credentials WHERE tenant_id = $1 AND provider = $2',
    [tenantId, provider]
  );
  if (rows.length === 0) return null;
  const { encrypted_payload, iv, auth_tag } = rows[0];
  return decryptPayload(encrypted_payload, iv, auth_tag);
}

/**
 * Encrypts and upserts a credential payload for (tenantId, provider).
 * Used both for initial setup and for writing back a refreshed token
 * (e.g. Keka's access_token/tokenExpiresAt after a token refresh).
 */
async function saveCredentials(tenantId, provider, payload) {
  const { encryptedPayload, iv, authTag } = encryptPayload(payload);
  await pool.query(
    `INSERT INTO credentials (tenant_id, provider, encrypted_payload, iv, auth_tag)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, provider)
     DO UPDATE SET encrypted_payload = $3, iv = $4, auth_tag = $5, updated_at = now()`,
    [tenantId, provider, encryptedPayload, iv, authTag]
  );
}

module.exports = { loadCredentials, saveCredentials };
