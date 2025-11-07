import { Pool } from 'pg';
import { setTimeout } from 'timers/promises';

const adminConnectionString = 'postgresql://postgres:postgres@localhost:5432/postgres';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;

export default async function globalTeardown() {
  const adminPool = new Pool({ connectionString: adminConnectionString });

  try {
    console.log('Waiting for all test connections to close...');
    await setTimeout(2000); // Add a 2-second delay to ensure connections are closed

    console.log('Terminating connections to the test database...');
    await adminPool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = 'recurring_meetings_test'
        AND pid <> pg_backend_pid();
    `);
    console.log('✓ Connections terminated');

    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        console.log('Dropping the test database...');
        await adminPool.query('DROP DATABASE IF EXISTS recurring_meetings_test');
        console.log('✓ Test database dropped');
        break;
      } catch (error) {
        if (error instanceof Error && error.message.includes('being accessed by other users')) {
          retries++;
          console.warn(`Retry ${retries}/${MAX_RETRIES}: Waiting for active connections to close...`);
          await setTimeout(RETRY_DELAY_MS);
        } else {
          throw error;
        }
      }
    }

    if (retries === MAX_RETRIES) {
      throw new Error('Failed to drop the test database after maximum retries.');
    }
  } catch (error) {
    console.error('Failed to drop test database:', error);
    throw error;
  } finally {
    await adminPool.end();
  }
}

if (require.main === module) {
  globalTeardown().catch((error) => {
    console.error('Error during global teardown:', error);
    process.exit(1);
  });
}