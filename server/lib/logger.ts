/**
 * Structured logger using Pino.
 * In production: JSON output (to stdout for systemd/journald).
 * In development: pretty-printed with pino-pretty.
 */

import pino from 'pino';
import type { LoggerOptions } from 'pino';

const isProd = process.env.NODE_ENV === 'production';

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
};

const logger = pino(options);

export default logger;
