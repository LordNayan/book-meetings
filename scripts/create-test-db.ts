#!/usr/bin/env ts-node

import { Client } from 'pg';

/**
 * Script to create the test database if it doesn't exist
 */
async function createTestDatabase() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres', // Connect to default postgres database
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Check if test database exists
    const checkDbQuery = `
      SELECT 1 FROM pg_database WHERE datname = 'recurring_meetings_test'
    `;
    const result = await client.query(checkDbQuery);

    if (result.rows.length === 0) {
      console.log('Creating test database...');
      await client.query('CREATE DATABASE recurring_meetings_test');
      console.log('Test database created successfully');
    } else {
      console.log('Test database already exists');
    }
  } catch (error) {
    console.error('Error creating test database:', error);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  createTestDatabase()
    .then(() => {
      console.log('Test database setup complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test database setup failed:', error);
      process.exit(1);
    });
}

export { createTestDatabase };
