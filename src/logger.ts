import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.logLevel,
  transport: config.nodeEnv !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
});
