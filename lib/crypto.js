/**
 * AES-256-GCM encrypt/decrypt for the `credentials` table's
 * encrypted_payload / iv / auth_tag columns (see docs/migrations/README.md
 * — ciphertext, nonce, and auth tag as three separate columns, not one
 * bundled JSON blob).
 *
 * ENCRYPTION_MASTER_KEY (.env) must be a base64-encoded 32-byte key.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const keyB64 = process.env.ENCRYPTION_MASTER_KEY;
  if (!keyB64) {
    throw new Error('ENCRYPTION_MASTER_KEY is not set — check .env');
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_MASTER_KEY must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}

/**
 * Encrypts a plain JS object (e.g. { companyId, publicKey, privateKey }).
 * Returns three Buffers matching the credentials table's three columns.
 */
function encryptPayload(payload) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encryptedPayload: ciphertext, iv, authTag };
}

/**
 * Reverses encryptPayload — takes the three raw columns back from Postgres
 * (as Buffers/Bytea) and returns the original plain JS object.
 */
function decryptPayload(encryptedPayload, iv, authTag) {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encryptedPayload), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = { encryptPayload, decryptPayload };
