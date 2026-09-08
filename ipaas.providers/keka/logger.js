/**
 * Local logger for this package — intentionally duplicated from
 * ipaas.orchestrationengine's lib/logger.js rather than shared via a
 * separate logging package, so this package stays self-contained and
 * independently publishable (see the repo README). Swap for a shared
 * logging package later if/when this duplication becomes painful — not
 * before.
 */
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
});

module.exports = { logger };
