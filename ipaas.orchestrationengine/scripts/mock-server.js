/**
 * Throwaway mock server — NOT part of the platform. Fakes just enough of
 * ConnectWise's and Keka's HTTP shape to exercise the REAL adapters and
 * the Orchestration Engine's cycle logic end-to-end, without real API
 * access. This does NOT verify anything about the real APIs — endpoint
 * paths, auth mechanics, and field shapes here are illustrative only. See
 * docs/LLD-connector-auth-layer.md for what's still genuinely unverified.
 *
 * Write and update behavior is deliberately rigged per fake company id,
 * to exercise the failed/retry reconciliation logic in
 * lib/orchestration/cycle.js:
 *   id 1, 4, 5 — always succeed
 *   id 2       — always fails (400) — should land in sync_state.failed
 *                and stay there every cycle
 *   id 3       — fails once (429) then succeeds — should land in
 *                sync_state.retry on the first cycle, then disappear on
 *                the second
 *
 * Usage: node scripts/mock-server.js [port]  (default 4000)
 */
const http = require('http');
const { URL } = require('url');

const PORT = Number(process.argv[2]) || 4000;

const COMPANIES = [
  { id: 1, name: 'Acme Corp', status: { id: 1, name: 'Active' }, _info: { lastUpdated: '2026-08-01T00:00:00Z' } },
  { id: 2, name: 'Globex Inc', status: { id: 1, name: 'Active' }, _info: { lastUpdated: '2026-08-02T00:00:00Z' } },
  { id: 3, name: 'Initech', status: { id: 1, name: 'Active' }, _info: { lastUpdated: '2026-08-03T00:00:00Z' } },
  { id: 4, name: 'Umbrella Corp', status: { id: 1, name: 'Active' }, _info: { lastUpdated: '2026-08-04T00:00:00Z' } },
  { id: 5, name: 'Wayne Enterprises', status: { id: 1, name: 'Active' }, _info: { lastUpdated: '2026-08-05T00:00:00Z' } },
];

// Tracks write attempts per id in memory, so id 3 can fail once then
// succeed on the next cycle.
const writeAttempts = {};
const updateAttempts = {};

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  // Connection: close tells the client not to keep this socket alive.
  // Without it, fetch()'s keep-alive connections to this server linger
  // after the script's own work is done, and process.exit() tearing them
  // down mid-transition is what causes the libuv assertion crash on
  // Windows — closing them properly here avoids that at the source.
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
    Connection: 'close',
  });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/** Matches the ConnectWise adapter's fetchByIds guess: conditions=id in (1,2,3) */
function extractIdsFromConditions(conditions) {
  const match = /id in \(([^)]+)\)/.exec(conditions || '');
  if (!match) return null;
  return match[1].split(',').map((s) => s.trim());
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  console.log(`${req.method} ${url.pathname}${url.search}`);

  try {
    // --- ConnectWise: GET /cw/company/companies (fetch + fetchByIds share this) ---
    if (req.method === 'GET' && url.pathname === '/cw/company/companies') {
      const ids = extractIdsFromConditions(url.searchParams.get('conditions'));
      const result = ids ? COMPANIES.filter((c) => ids.includes(String(c.id))) : COMPANIES;
      return sendJson(res, 200, result); // no Link header — one page is enough here
    }

    // --- Keka: POST /keka/identity/token ---
    if (req.method === 'POST' && url.pathname === '/keka/identity/token') {
      await readJsonBody(req).catch(() => ({})); // form-urlencoded in real use; body unused by the mock
      return sendJson(res, 200, { access_token: 'mock-access-token', expires_in: 3600, token_type: 'Bearer', scope: 'kekaapi' });
    }

    // --- Keka: POST /keka/api/v1/psa/clients (write) ---
    if (req.method === 'POST' && url.pathname === '/keka/api/v1/psa/clients') {
      const record = await readJsonBody(req);
      const id = String(record.id);

      if (id === '2') {
        return sendJson(res, 400, { message: `mock: record ${id} always fails (data error)` });
      }
      if (id === '3') {
        writeAttempts[id] = (writeAttempts[id] || 0) + 1;
        if (writeAttempts[id] === 1) {
          return sendJson(res, 429, { message: `mock: record ${id} rate-limited on first attempt` });
        }
      }
      return sendJson(res, 200, { id, status: 'created' });
    }

    // --- Keka: PUT /keka/api/v1/psa/clients/:id (update) ---
    const kekaClientMatch = url.pathname.match(/^\/keka\/api\/v1\/psa\/clients\/([^/]+)$/);
    if (req.method === 'PUT' && kekaClientMatch) {
      const id = decodeURIComponent(kekaClientMatch[1]);
      await readJsonBody(req);

      if (id === '2') {
        return sendJson(res, 400, { message: `mock: record ${id} always fails (data error)` });
      }
      if (id === '3') {
        updateAttempts[id] = (updateAttempts[id] || 0) + 1;
        if (updateAttempts[id] === 1) {
          return sendJson(res, 429, { message: `mock: record ${id} rate-limited on first update attempt` });
        }
      }
      return sendJson(res, 200, { id, status: 'updated' });
    }

    sendJson(res, 404, { message: `mock: no route for ${req.method} ${url.pathname}` });
  } catch (err) {
    sendJson(res, 500, { message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Mock ConnectWise/Keka server listening on http://localhost:${PORT}`);
  console.log('Routes: GET /cw/company/companies, POST /keka/identity/token, POST /keka/api/v1/psa/clients, PUT /keka/api/v1/psa/clients/:id');
});
