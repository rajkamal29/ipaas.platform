/**
 * Throwaway script — inserts FAKE credentials pointing at the local mock
 * server (scripts/mock-server.js), so the real adapters can be exercised
 * end-to-end without real ConnectWise/Keka access.
 *
 * These are not real credentials and must never point at real hosts.
 *
 * Usage: node scripts/seed-mock-credentials.js <tenant_id> [mockServerBaseUrl]
 */
require('dotenv').config();
const { saveCredentials } = require('../lib/credentials');
const { pool } = require('../lib/db');

async function main() {
  const tenantId = process.argv[2];
  const base = process.argv[3] || 'http://localhost:4000';
  if (!tenantId) {
    console.error('Usage: node scripts/seed-mock-credentials.js <tenant_id> [mockServerBaseUrl]');
    process.exit(1);
  }

  await saveCredentials(tenantId, 'connectwise', {
    baseUrl: `${base}/cw`,
    apiVersion: '',
    companyId: 'mock-company',
    publicKey: 'mock-public-key',
    privateKey: 'mock-private-key',
    clientId: 'mock-clientId-header',
    pageSize: 100,
  });
  console.log('Saved fake ConnectWise credentials.');

  await saveCredentials(tenantId, 'keka', {
    apiBaseUrl: `${base}/keka`,
    identityUrl: `${base}/keka`,
    tokenEndpoint: '/identity/token',
    clientId: 'mock-client-id',
    clientSecret: 'mock-client-secret',
    apiKey: 'mock-api-key',
    grantType: 'client_credentials',
    scope: 'kekaapi',
  });
  console.log('Saved fake Keka credentials.');

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('FAILED:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
