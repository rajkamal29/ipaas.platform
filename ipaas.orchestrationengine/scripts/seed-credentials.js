/**
 * Seeds REAL provider credentials for a tenant — the credential-write path
 * that doesn't have a UI/API yet (see docs/LLD-orchestration-engine.md's
 * backlog). Encrypts and inserts via the same lib/credentials.js the
 * running engine itself uses, so what this writes is exactly what
 * adapter-registry.js will load and decrypt at sync time.
 *
 * This is NOT the mock/demo path — see seed-mock-credentials.js for that
 * (fake values pointed at scripts/mock-server.js). This script is for a
 * real ConnectWise or Keka tenant with real API access.
 *
 * Usage: node scripts/seed-credentials.js <tenant_id> <provider> <path-to-credentials.json>
 *
 * The JSON file's required shape depends on provider (matches exactly what
 * each adapter's constructor expects — see ipaas.providers/<provider>/index.js):
 *
 *   connectwise: { baseUrl, apiVersion, companyId, publicKey, privateKey, clientId, pageSize? }
 *   keka:        { apiBaseUrl, identityUrl, tokenEndpoint, clientId, clientSecret, apiKey, grantType, scope }
 *
 * Security: the JSON file contains real secrets in plaintext on disk.
 *   - Keep it outside this repo (or anywhere git-tracked) — *.credentials.json
 *     is gitignored as a defensive backstop, but don't rely on that alone.
 *   - Delete it once this script reports success. The secret now lives
 *     encrypted (AES-256-GCM, see lib/crypto.js) in Postgres; the plaintext
 *     file has no further reason to exist.
 *   - Never paste real secrets into a terminal command's arguments — they'd
 *     land in shell history. That's why this script takes a file path, not
 *     the credential fields directly as CLI args.
 */
require('dotenv').config();
const fs = require('fs');
const { saveCredentials } = require('../lib/credentials');
const { pool } = require('../lib/db');

const REQUIRED_FIELDS = {
  connectwise: ['baseUrl', 'apiVersion', 'companyId', 'publicKey', 'privateKey', 'clientId'],
  keka: ['apiBaseUrl', 'identityUrl', 'tokenEndpoint', 'clientId', 'clientSecret', 'apiKey', 'grantType', 'scope'],
};

function usage() {
  console.error('Usage: node scripts/seed-credentials.js <tenant_id> <provider> <path-to-credentials.json>');
  console.error(`  provider: ${Object.keys(REQUIRED_FIELDS).join(' | ')}`);
  console.error('  See this file\'s header comment for the required JSON shape per provider.');
}

async function main() {
  const [tenantId, provider, filePath] = process.argv.slice(2);

  if (!tenantId || !provider || !filePath) {
    usage();
    process.exit(1);
  }

  if (!REQUIRED_FIELDS[provider]) {
    console.error(`Unknown provider "${provider}" — must be one of: ${Object.keys(REQUIRED_FIELDS).join(', ')}`);
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse ${filePath} as JSON: ${err.message}`);
    process.exit(1);
  }

  const missing = REQUIRED_FIELDS[provider].filter((field) => !(field in payload));
  if (missing.length > 0) {
    console.error(`Credentials file is missing required field(s) for "${provider}": ${missing.join(', ')}`);
    console.error(`Required: ${REQUIRED_FIELDS[provider].join(', ')}`);
    process.exit(1);
  }

  await saveCredentials(tenantId, provider, payload);
  console.log(`Saved real ${provider} credentials for tenant ${tenantId}.`);
  console.log(`Reminder: ${filePath} still has the plaintext secret on disk — delete it now that it's encrypted in Postgres.`);

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('FAILED:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
