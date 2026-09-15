/**
 * Dynamic adapter registry.
 *
 * Maps a provider name (as stored in sync_requests.source/target) to its
 * adapter class. Adding a new provider later means one new entry here —
 * nothing else in the engine needs to change.
 *
 * Updated 2026-09-08 for the ipaas.providers split: adapters no longer
 * load their own credentials (see @rajkamal29/adapter-connectwise and
 * @rajkamal29/adapter-keka — both are storage-agnostic by design now). This
 * module is where that gap gets closed: createAdapter loads the tenant's
 * credentials via lib/credentials.js and passes them into the adapter's
 * constructor, along with a save-back callback for providers (Keka) that
 * refresh a token mid-flow. This makes createAdapter async where it
 * wasn't before — every caller needs `await`.
 */
const { ConnectWiseAdapter } = require('@rajkamal29/adapter-connectwise');
const { KekaAdapter } = require('@rajkamal29/adapter-keka');
const { loadCredentials, saveCredentials } = require('../credentials');

const REGISTRY = {
  connectwise: ConnectWiseAdapter,
  keka: KekaAdapter,
};

/**
 * @param {string} provider - e.g. 'connectwise' or 'keka'
 * @param {string} tenantId
 * @param logger - optional run-scoped logger, forwarded into the adapter
 *   constructor so its log lines carry this run's context.
 * @returns {Promise<import('@rajkamal29/adapter-connectwise').ConnectWiseAdapter
 *         | import('@rajkamal29/adapter-keka').KekaAdapter>}
 */
async function createAdapter(provider, tenantId, logger) {
  const AdapterClass = REGISTRY[provider];
  if (!AdapterClass) {
    throw new Error(`No adapter registered for provider "${provider}"`);
  }

  const credentials = await loadCredentials(tenantId, provider);
  if (!credentials) {
    throw new Error(`No ${provider} credentials found for tenant ${tenantId}`);
  }

  const onCredentialsRefreshed = (updated) => saveCredentials(tenantId, provider, updated);

  return new AdapterClass(tenantId, credentials, { onCredentialsRefreshed }, logger);
}

module.exports = { createAdapter };
