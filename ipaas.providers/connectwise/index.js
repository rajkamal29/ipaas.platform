/**
 * ConnectWise Manage adapter.
 *
 * Implements the adapter contract agreed in the Orchestration Engine design
 * discussion (2026-09-01): authenticate / fetch / fetchByIds / write /
 * update.
 *
 * Client entity + fetch()'s pagination/auth mechanics were previously
 * verified live against the real API (see docs/LLD-connector-auth-layer.md
 * §4). Project and Time Entry endpoints below are best guesses (§4a) — NOT
 * yet verified. fetchByIds is new, unverified surface for every entity —
 * see the note on that method before trusting it.
 *
 * Storage-agnostic as of the ipaas.providers split (2026-09-08): this
 * adapter no longer loads its own credentials from Postgres — the caller
 * (the orchestration engine's adapter-registry.js) loads them and passes
 * them into the constructor. This package has zero knowledge of Postgres,
 * encryption, or how/where credentials are stored — see the repo README
 * for why (packages must be self-contained to be independently published).
 */

const { logger: defaultLogger } = require('./logger');

// Canonical entity name -> ConnectWise REST resource path.
// "client" is verified live. "project"/"timesheet" are best guesses,
// following ConnectWise's {module}/{resource} convention (§4a).
const ENTITY_ENDPOINTS = {
  client: 'company/companies',
  project: 'project/projects', // UNVERIFIED — docs/LLD-connector-auth-layer.md §4a
  timesheet: 'time/entries', // UNVERIFIED — docs/LLD-connector-auth-layer.md §4a
};

class ConnectWiseAdapter {
  /**
   * @param {string} tenantId - this container is scoped to one
   *   sync_entities row (one tenant), so tenantId is fixed for this
   *   adapter's lifetime — passed in from the caller.
   * @param {object} credentials - the decrypted credential payload for
   *   this tenant+provider, already loaded by the caller. Required —
   *   this adapter does not know how to load its own credentials.
   * @param {object} [options] - { onCredentialsRefreshed } — ConnectWise's
   *   API Member auth is a static key pair with nothing to refresh, so
   *   this adapter never calls it. Accepted anyway so the constructor
   *   signature stays uniform across every adapter (see KekaAdapter,
   *   which does use it).
   * @param logger - defaults to a base child logger; the orchestration
   *   engine should pass a run-scoped child logger instead so log lines
   *   carry that run's syncRunId.
   */
  constructor(
    tenantId,
    credentials,
    { onCredentialsRefreshed, successLogger = defaultLogger } = {},
    logger = defaultLogger.child({ component: 'connectwise-adapter' })
  ) {
    if (!tenantId) throw new Error('ConnectWiseAdapter requires a tenantId');
    if (!credentials) throw new Error('ConnectWiseAdapter requires credentials to be provided by the caller');
    this._tenantId = tenantId;
    this._creds = credentials; // static key pair — provided once, nothing to refresh
    this._onCredentialsRefreshed = onCredentialsRefreshed; // unused by this adapter, kept for contract uniformity
    this._successLogger = successLogger;
    this._logger = logger.child({ tenantId, provider: 'connectwise' });
  }

  /**
   * API Member auth is a static key pair (company ID + public/private
   * key), not a token — there's nothing to load or refresh. Kept as an
   * async method (rather than removed) so the adapter contract stays
   * uniform across providers that DO need to refresh (see Keka).
   */
  async authenticate() {
    return this._creds;
  }

  _authHeader(creds) {
    const authString = `${creds.companyId}+${creds.publicKey}:${creds.privateKey}`;
    return 'Basic ' + Buffer.from(authString).toString('base64');
  }

  /**
   * Parses the Link response header into { next, last, ... } URLs.
   * ConnectWise doesn't return a page-count field in the response body —
   * the last page number has to come from rel="last" here.
   */
  _parseLinkHeader(linkHeader) {
    const links = {};
    if (!linkHeader) return links;
    for (const part of linkHeader.split(',')) {
      const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      if (match) links[match[2]] = match[1];
    }
    return links;
  }

  _pageNumberFromUrl(url) {
    if (!url) return null;
    const page = new URL(url).searchParams.get('page');
    return page ? Number(page) : null;
  }

  /**
   * Wraps a non-OK response into a typed error so the Orchestration
   * Engine's retry policy can branch on err.type instead of parsing
   * messages: auth (401/403), rate_limit (429), not_found (404), unknown.
   */
  async _throwForResponse(res) {
    const body = await res.text().catch(() => '');
    const err = new Error(`ConnectWise request failed: ${res.status} ${res.statusText} — ${body.slice(0, 500)}`);
    err.status = res.status;
    if (res.status === 401 || res.status === 403) err.type = 'auth';
    else if (res.status === 429) err.type = 'rate_limit';
    else if (res.status === 404) err.type = 'not_found';
    else if (res.status === 400) err.type = 'validation'; // rejected payload — data issue, not transient
    else err.type = 'unknown';
    this._logger[err.type === 'auth' ? 'error' : 'warn'](
      { status: res.status, errType: err.type },
      'ConnectWise request failed'
    );
    throw err;
  }

  _endpointFor(entity) {
    const endpoint = ENTITY_ENDPOINTS[entity];
    if (!endpoint) {
      throw new Error(`ConnectWise adapter: unsupported entity "${entity}"`);
    }
    return endpoint;
  }

  /**
   * Fetches one page of an entity's delta records (modifiedSince-filtered).
   * Returns the normalized shape: { records, pageNumber, totalPages, hasMore }.
   */
  async fetch(entity, { pageNumber = 1, pageSize, modifiedSince } = {}) {
    const creds = await this.authenticate();
    const endpoint = this._endpointFor(entity);

    const effectivePageSize = pageSize || creds.pageSize || 100;
    const url = new URL(`${creds.baseUrl}${creds.apiVersion}/${endpoint}`);
    url.searchParams.set('page', String(pageNumber));
    url.searchParams.set('pageSize', String(effectivePageSize));
    if (modifiedSince) {
      url.searchParams.set('conditions', `_info/lastUpdated > [${modifiedSince}]`);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: this._authHeader(creds),
        clientId: creds.clientId,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      await this._throwForResponse(res);
    }

    const records = await res.json();
    const links = this._parseLinkHeader(res.headers.get('link'));
    const hasMore = Boolean(links.next);
    const totalPages = this._pageNumberFromUrl(links.last) || pageNumber;

    this._logger.debug({ entity, pageNumber, totalPages, records: records.length }, 'page fetched');
    return { records, pageNumber, totalPages, hasMore };
  }

  /**
   * Fetches specific records by ID — used to reconcile sync_state's
   * `failed` and `retry` entries (see docs/migrations/README.md) alongside
   * each run's normal delta fetch.
   *
   * UNVERIFIED — best guess only. Assumes the `conditions` query param
   * (already used for the modifiedSince filter above) also supports an
   * `id in (...)` clause, following ConnectWise's documented query syntax
   * elsewhere in their API. This has NOT been confirmed against the real
   * API — verify before trusting: does `conditions=id in (42,43)` actually
   * work, and does the endpoint still paginate correctly when filtering
   * this way?
   */
  async fetchByIds(entity, ids) {
    if (!ids || ids.length === 0) return [];
    const creds = await this.authenticate();
    const endpoint = this._endpointFor(entity);

    const url = new URL(`${creds.baseUrl}${creds.apiVersion}/${endpoint}`);
    url.searchParams.set('conditions', `id in (${ids.join(',')})`);
    url.searchParams.set('pageSize', String(ids.length));

    // Reconciliation calls this routinely, so record it at debug level;
    // the method comment above still documents the unverified API assumption.
    this._logger.debug({ entity, ids }, 'fetchByIds request');

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: this._authHeader(creds),
        clientId: creds.clientId,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      await this._throwForResponse(res);
    }

    return res.json();
  }

  async _sendRecord(entity, method, record, id) {
    const creds = await this.authenticate();
    const endpoint = this._endpointFor(entity);
    const itemPath = id === undefined ? '' : `/${encodeURIComponent(String(id))}`;
    const url = `${creds.baseUrl}${creds.apiVersion}/${endpoint}${itemPath}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: this._authHeader(creds),
        clientId: creds.clientId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(record),
    });

    if (!res.ok) {
      await this._throwForResponse(res);
    }

    this._successLogger.info(`${entity}: ${record.name} ${id === undefined ? 'created' : 'updated'}  in ConnectWise`);
    if (res.status === 204) return null;
    return res.json();
  }

  /** Creates one target-shaped record in the entity collection. */
  async write(entity, record) {
    return this._sendRecord(entity, 'POST', record);
  }

  /** Replaces one target-shaped record at the provider's entity/id endpoint. */
  async update(entity, id, record) {
    if (id === undefined || id === null || id === '') {
      throw new Error('ConnectWise adapter: update() requires a record id');
    }
    return this._sendRecord(entity, 'PUT', record, id);
  }
}

module.exports = { ConnectWiseAdapter };
