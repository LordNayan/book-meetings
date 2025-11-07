import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA_CLIENT__: PrismaClient | undefined;
}

// Singleton Prisma client for tests
export const prisma = global.__PRISMA_CLIENT__ || new PrismaClient({
  log: process.env.DEBUG === 'true' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.__PRISMA_CLIENT__ = prisma;
}

// Setup function to run before each test file
beforeAll(async () => {
  await prisma.$connect();
});

// Note: Prisma client is disconnected in globalTeardown.ts
// to avoid premature disconnection during test execution

