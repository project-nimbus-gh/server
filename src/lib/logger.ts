import pino from 'pino';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger = pino({
  level,
  base: {
    service: 'nimbus-server'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

export function createLogger(name: string) {
  return logger.child({ component: name });
}
