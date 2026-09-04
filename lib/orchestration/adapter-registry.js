/**
 * Dynamic adapter registry (Orchestration Engine build plan, Step 2).
 *
 * Maps a provider name (as stored in sync_requests.source/target) to its
 * adapter class. Adding a new provider later means one new entry here —
 * nothing else in the engine needs to change.
 */
const { ConnectWiseAdapter } = require('@ipaas/adapter-connectwise');
const { KekaAdapter } = require('@ipaas/adapter-keka');

const REGISTRY = {
  connectwise: ConnectWiseAdapter,
  keka: KekaAdapter,
};

/**
 * @param {string} provider - e.g. 'connectwise' or 'keka'
 * @param {string} tenantId
 * @returns {import('@ipaas/adapter-connectwise').ConnectWiseAdapter
 *         | import('@ipaas/adapter-keka').KekaAdapter}
 */
function createAdapter(provider, tenantId) {
  const AdapterClass = REGISTRY[provider];
  if (!AdapterClass) {
    throw new Error(`No adapter registered for provider "${provider}"`);
  }
  return new AdapterClass(tenantId);
}

module.exports = { createAdapter };
