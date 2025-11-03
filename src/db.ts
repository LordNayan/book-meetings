import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// PrismaClient singleton pattern for optimal connection pooling
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });
};

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

// Log Prisma queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e: { query: string; params: string; duration: number }) => {
    logger.debug({ query: e.query, params: e.params, duration: e.duration }, 'Prisma Query');
  });
}

prisma.$on('error', (e: { target: string; message: string }) => {
  logger.error({ target: e.target, message: e.message }, 'Prisma Error');
});

prisma.$on('warn', (e: { target: string; message: string }) => {
  logger.warn({ target: e.target, message: e.message }, 'Prisma Warning');
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export { prisma };
