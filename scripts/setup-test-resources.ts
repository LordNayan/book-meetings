import { Pool } from 'pg';
import { execSync } from 'child_process';

const RESOURCE_IDS = [
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440004',
  '550e8400-e29b-41d4-a716-446655440005',
  '550e8400-e29b-41d4-a716-446655440006',
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440008',
];

/**
 * Ensures test database exists and is properly initialized with schema
 */
async function ensureTestDatabase() {
  const adminPool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5432',
  });

  try {
    console.log('Checking if test database exists...');
    
    const result = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = 'recurring_meetings_test'`
    );
    
    if (result.rows.length === 0) {
      console.log('Test database does not exist. Creating...');
      await adminPool.query('CREATE DATABASE recurring_meetings_test');
      console.log('✓ Test database created');
    } else {
      console.log('✓ Test database already exists');
    }
  } catch (error) {
    console.error('Error ensuring test database:', error);
    throw error;
  } finally {
    await adminPool.end();
  }
}

/**
 * Ensures test database schema is up-to-date by running migrations
 */
async function ensureTestSchema() {
  console.log('Ensuring test database schema is up-to-date...');
  
  try {
    execSync('DATABASE_URL=postgresql://postgres:postgres@localhost:5432/recurring_meetings_test npm run db:migrate', {
      stdio: 'inherit',
    });
    console.log('✓ Schema migrations completed');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}



/**
 * Drops and recreates the test database (optional cleanup)
 */
async function dropAndRecreateDatabase() {
  const adminPool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres',
  });

  try {
    console.log('Dropping and recreating test database...');
    await adminPool.query('DROP DATABASE IF EXISTS recurring_meetings_test WITH (FORCE)');
    await adminPool.query('CREATE DATABASE recurring_meetings_test');
    console.log('✓ Test database recreated');
  } catch (error) {
    console.error('Error recreating test database:', error);
    throw error;
  } finally {
    await adminPool.end();
  }
}

/**
 * Creates test resources for load/spike testing
 */
async function createTestResources() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/recurring_meetings_test',
  });

  try {
    console.log('\nCreating test resources...');
    
    for (const resourceId of RESOURCE_IDS) {
      await pool.query(
        `INSERT INTO resources (id, name) 
         VALUES ($1, $2) 
         ON CONFLICT (id) DO NOTHING`,
        [resourceId, `Load Test Resource ${resourceId.slice(-4)}`]
      );
      console.log(`✓ Created resource: ${resourceId}`);
    }
    
    console.log('\n✅ Test resources setup complete!');
  } catch (error) {
    console.error('Error creating test resources:', error);
    throw error;
  } finally {
    await pool.end();
  }
}



async function main() {
  const shouldRecreate = process.argv.includes('--recreate');

  try {
    if (shouldRecreate) {
      await dropAndRecreateDatabase();
    } else {
      await ensureTestDatabase();
    }

    await ensureTestSchema();
    await createTestResources();
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

main();
