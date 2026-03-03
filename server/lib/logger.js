/**
 * Structured logger using Pino.
 * In production: JSON output (to stdout for systemd/journald).
 * In development: pretty-printed with pino-pretty.
 */

import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export default logger;
