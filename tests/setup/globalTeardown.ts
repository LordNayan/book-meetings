import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

export default async function globalTeardown() {
  try {
    // Always disconnect Prisma first
    await prisma.$disconnect();

    // Use the default postgres database to drop the test database
    const adminUrl = 'postgresql://postgres:postgres@localhost:5432/postgres';
    
    // Force terminate all connections to the test database
    execSync(
      `psql "${adminUrl}" -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = 'recurring_meetings_test' AND pid <> pg_backend_pid();"`,
      { stdio: 'inherit' }
    );

    // Drop the database
    execSync(
      `psql "${adminUrl}" -c "DROP DATABASE IF EXISTS recurring_meetings_test;"`,
      { stdio: 'inherit' }
    );
  } catch (error) {
    console.error('Failed to drop test database:', error);
    throw error;
  }
}