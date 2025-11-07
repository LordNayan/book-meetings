import { Pool } from 'pg';
import { setTimeout } from 'timers/promises';

const testDbConnectionString = 'postgresql://postgres:postgres@localhost:5432/recurring_meetings_test';

export default async function globalTeardown() {
  const testDbPool = new Pool({ connectionString: testDbConnectionString });

  try {
    console.log('Waiting for all test connections to close...');
    await setTimeout(2000); // Add a 2-second delay to ensure connections are closed

    console.log('Cleaning up test database...');
    
    // Drop all tables in the correct order (respecting foreign key constraints)
    // Using CASCADE to handle dependent tables automatically
    await testDbPool.query(`
      DROP TABLE IF EXISTS exceptions, recurrence_rules, bookings, resources CASCADE;
    `);
    
    console.log('✓ Test database cleaned up');
  } catch (error) {
    console.error('Failed to clean up test database:', error);
    throw error;
  } finally {
    await testDbPool.end();
  }
}

if (require.main === module) {
  globalTeardown().catch((error) => {
    console.error('Error during global teardown:', error);
    process.exit(1);
  });
}