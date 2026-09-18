/**
 * Keka adapter.
 *
 * Implements the adapter contract agreed in the Orchestration Engine design
 * discussion (2026-09-01): authenticate / fetch / fetchByIds / write /
 * update.
 *
 * Client entity + fetch()'s pagination/auth mechanics were previously
 * verified live against the real API (see docs/LLD-connector-auth-layer.md
 * §5). Project and Timesheet endpoints below are best guesses (§5a) — NOT
 * yet verified (Timesheet especially — two candidate paths exist, see the
 * comment below). write() and fetchByIds are both unverified surface —
 * see their comments before trusting them.
 *
 * Storage-agnostic as of the ipaas.providers split (2026-09-08): this
 * adapter no longer loads its own credentials from Postgres, or persists
 * a refreshed token itself. The caller (the orchestration engine's
 * adapter-registry.js) loads the initial credentials and passes them into
 * the constructor, along with an onCredentialsRefreshed callback this
 * adapter invokes whenever it refreshes Keka's OAuth token — the adapter
 * still knows WHEN a refresh happened, it just no longer knows HOW or
 * WHERE that gets persisted. This package has zero knowledge of Postgres
 * or encryption — see the repo README for why (packages must be
 * self-contained to be independently published).
 */

const { logger: defaultLogger } = require('./logger');

// Canonical entity name -> Keka REST resource path.
// "client" is verified live. "project"/"timesheet" are best guesses (§5a).
const ENTITY_ENDPOINTS = {
  client: '/api/v1/psa/clients',
  project: '/api/v1/psa/projects', // UNVERIFIED — docs/LLD-connector-auth-layer.md §5a
  // UNVERIFIED, low confidence — §5a flags /api/v1/time/entries as an
  // alternate candidate if this one is wrong (Keka is primarily an HR
  // platform, so time tracking may live outside the /psa/ namespace).
  timesheet: '/api/v1/psa/timesheets',
};

class KekaAdapter {
  /**
   * @param {string} tenantId - this container is scoped to one
   *   sync_entities row (one tenant), so tenantId is fixed for this
   *   adapter's lifetime — passed in from the caller.
   * @param {object} credentials - the decrypted credential payload for
   *   this tenant+provider, already loaded by the caller:
   *   {apiBaseUrl, identityUrl, tokenEndpoint, clientId, clientSecret,
   *   apiKey, grantType, scope, accessToken?, tokenExpiresAt?}. Required.
   * @param {object} [options] - { onCredentialsRefreshed(creds), successLogger } —
   *   called (awaited) whenever this adapter refreshes the OAuth token,
   *   with the full updated credential payload, so the caller can persist
   *   it. Optional, but a refreshed token will simply not be saved
   *   anywhere if omitted — every call in a fresh process will hit the
   *   token endpoint again.
   * @param logger - defaults to a base child logger; the orchestration
   *   engine should pass a run-scoped child logger instead.
   */
  constructor(
    tenantId,
    credentials,
    { onCredentialsRefreshed, successLogger = defaultLogger } = {},
    logger = defaultLogger.child({ component: 'keka-adapter' })
  ) {
    if (!tenantId) throw new Error('KekaAdapter requires a tenantId');
    if (!credentials) throw new Error('KekaAdapter requires credentials to be provided by the caller');
    this._tenantId = tenantId;
    this._creds = credentials;
    this._onCredentialsRefreshed = onCredentialsRefreshed;
    this._successLogger = successLogger;
    this._logger = logger.child({ tenantId, provider: 'keka' });
  }

  _isTokenValid(creds) {
    if (!creds.accessToken || !creds.tokenExpiresAt) return false;
    // Refresh a bit early (60s buffer) rather than racing an exact expiry.
    return new Date(creds.tokenExpiresAt).getTime() - Date.now() > 60_000;
  }

  /**
   * Ensures a valid access token is cached on this._creds, fetching a new
   * one from Keka's token endpoint if missing or expired, and invoking
   * onCredentialsRefreshed (if provided) with the updated payload so the
   * caller can persist it — this adapter no longer persists it itself.
   */
  async authenticate() {
    if (this._isTokenValid(this._creds)) return this._creds;

    this._logger.debug('token expired or missing — requesting a new one');

    const tokenUrl = `${this._creds.identityUrl}${this._creds.tokenEndpoint}`;
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla', // required per Keka's own docs
      },
      body: new URLSearchParams({
        client_id: this._creds.clientId,
        client_secret: this._creds.clientSecret,
        api_key: this._creds.apiKey,
        grant_type: this._creds.grantType,
        scope: this._creds.scope,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Keka token request failed: ${res.status} ${res.statusText} — ${body.slice(0, 500)}`);
      err.status = res.status;
      err.type = res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown';
      this._logger.error({ status: res.status, errType: err.type }, 'Keka token refresh failed');
      throw err;
    }

    const body = await res.json();
    this._creds.accessToken = body.access_token;
    // expires_in is seconds-from-now, not an absolute timestamp — compute our own.
    this._creds.tokenExpiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString();

    if (this._onCredentialsRefreshed) {
      await this._onCredentialsRefreshed(this._creds);
    }
    this._logger.debug({ tokenExpiresAt: this._creds.tokenExpiresAt }, 'token refreshed');
    return this._creds;
  }

  async _throwForResponse(res) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Keka request failed: ${res.status} ${res.statusText} — ${body.slice(0, 500)}`);
    err.status = res.status;
    if (res.status === 401 || res.status === 403) err.type = 'auth';
    else if (res.status === 429) err.type = 'rate_limit';
    else if (res.status === 404) err.type = 'not_found';
    else if (res.status === 400) err.type = 'validation'; // rejected payload — data issue, not transient
    else err.type = 'unknown';
    this._logger[err.type === 'auth' ? 'error' : 'warn'](
      { status: res.status, errType: err.type },
      'Keka request failed'
    );
    throw err;
  }

  _endpointFor(entity) {
    const endpoint = ENTITY_ENDPOINTS[entity];
    if (!endpoint) {
      throw new Error(`Keka adapter: unsupported entity "${entity}"`);
    }
    return endpoint;
  }

  /**
   * Fetches one page of an entity's delta records. Returns the normalized
   * shape: { records, pageNumber, totalPages, hasMore }. Keka reports
   * pagination in the response body, unlike ConnectWise's Link header.
   */
  async fetch(entity, { pageNumber = 1, pageSize = 100, modifiedSince } = {}) {
    const creds = await this.authenticate();
    const endpoint = this._endpointFor(entity);

    const url = new URL(`${creds.apiBaseUrl}${endpoint}`);
    url.searchParams.set('pageNumber', String(pageNumber));
    url.searchParams.set('pageSize', String(pageSize));
    if (modifiedSince) {
      url.searchParams.set('lastModified', modifiedSince);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'User-Agent': 'Mozilla',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      await this._throwForResponse(res);
    }

    const body = await res.json();
    const records = body.data ?? body.records ?? body.items ?? [];
    const totalPages = body.totalPages ?? pageNumber;
    const hasMore = pageNumber < totalPages;

    this._logger.debug({ entity, pageNumber, totalPages, records: records.length }, 'page fetched');
    return { records, pageNumber, totalPages, hasMore };
  }

  /**
   * Fetches specific records by ID — used to reconcile sync_state's
   * `failed` and `retry` entries alongside each run's normal delta fetch.
   *
   * UNVERIFIED — best guess only. Assumes an `ids` query param filters the
   * collection, the same way pageNumber/lastModified do above. This has
   * NOT been confirmed against Keka's real API or OpenAPI spec — verify
   * before trusting.
   */
  async fetchByIds(entity, ids) {
    if (!ids || ids.length === 0) return [];
    const creds = await this.authenticate();
    const endpoint = this._endpointFor(entity);

    const url = new URL(`${creds.apiBaseUrl}${endpoint}`);
    url.searchParams.set('ids', ids.join(','));
    url.searchParams.set('pageSize', String(ids.length));

    this._logger.warn({ entity, ids }, 'fetchByIds: unverified endpoint/filter — see method comment');

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'User-Agent': 'Mozilla',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      await this._throwForResponse(res);
    }

    const body = await res.json();
    return body.data ?? body.records ?? body.items ?? [];
  }

  async _sendRecord(entity, method, record, id) {
    const creds = await this.authenticate();
    const endpoint = this._endpointFor(entity);

    const itemPath = id === undefined ? '' : `/${encodeURIComponent(String(id))}`;
    const url = `${creds.apiBaseUrl}${endpoint}${itemPath}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'User-Agent': 'Mozilla',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(record),
    });

    if (!res.ok) {
      await this._throwForResponse(res);
    }

    this._successLogger.info(`${entity}: ${record.name} ${id === undefined ? 'created' : 'updated'} in Keka`);
    if (res.status === 204) return null;
    return res.json();
  }

  /**
   * Pushes one target-shaped record to Keka's entity collection.
   *
   * The client create endpoint uses POST; project/timesheet paths remain
   * unverified until those provider surfaces are exercised against a real
   * account.
   */
  async write(entity, record) {
    return this._sendRecord(entity, 'POST', record);
  }

  /** Updates one target-shaped record through Keka's documented PUT item endpoint. */
  async update(entity, id, record) {
    if (id === undefined || id === null || id === '') {
      throw new Error('Keka adapter: update() requires a record id');
    }
    return this._sendRecord(entity, 'PUT', record, id);
  }
}

module.exports = { KekaAdapter };
