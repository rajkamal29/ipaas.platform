/**
 * Shared structured logger (pino). Every module gets a child logger tagged
 * with its own component name, so log lines are filterable (by tenantId,
 * component, etc.) without repeating context on every call site.
 */
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
});

module.exports = { logger };
