import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { config } from '../src/config';
import { logger } from '../src/logger';

const runMigrations = async () => {
  const client = new Client({
    connectionString: config.databaseUrl,
  });

  try {
    await client.connect();
    logger.info('Connected to database');

    // Check if schema is already initialized
    const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'resources'
      );
    `;
    
    const result = await client.query(checkTableQuery);
    const tableExists = result.rows[0].exists;

    if (tableExists) {
      logger.info('Database schema already initialized');
      return;
    }

    logger.info('Running initial migration...');

    // Read and execute migration file
    const migrationPath = join(__dirname, '../db/migrations/001_init.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    await client.query(migrationSQL);

    logger.info('Migration completed successfully');
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    throw error;
  } finally {
    await client.end();
  }
};

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Database initialization complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Database initialization failed');
      process.exit(1);
    });
}

export { runMigrations };
