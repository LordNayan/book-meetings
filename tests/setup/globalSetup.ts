import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

// Explicitly set the DATABASE_URL for the test database
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/recurring_meetings_test';

const prisma = new PrismaClient();

export default async function globalSetup() {
  console.log('Setting up test database...');
  
  try {
    // Ensure the test database is created and migrations are applied
    execSync('ts-node scripts/create-test-db.ts', { stdio: 'inherit' });
    execSync('ts-node scripts/init-db.ts', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}
