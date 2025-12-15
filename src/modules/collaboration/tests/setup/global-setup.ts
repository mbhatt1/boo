/**
 * Global Setup - Runs once before all tests
 * 
 * Initializes test databases, Redis, and other shared resources
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import * as fs from 'fs/promises';
import * as path from 'path';

export default async function globalSetup() {
  console.log('🚀 Setting up test environment...');
  
  // Check if database setup should be skipped (for unit tests with mocked dependencies)
  if (process.env.SKIP_DB_SETUP === 'true') {
    console.log('⏭️  Skipping database setup (SKIP_DB_SETUP=true)');
    console.log('✅ Test environment ready (unit test mode)');
    return;
  }
  
  // Database setup - try with current user first (mbhatt)
  const currentUser = process.env.USER || process.env.USERNAME || 'mbhatt';
  let pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres', // Connect to postgres to create test db
    user: process.env.DB_USER || currentUser,
    password: process.env.DB_PASSWORD || '',
  });
  
  try {
    // Create postgres user if it doesn't exist (for compatibility)
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
            CREATE ROLE postgres WITH SUPERUSER CREATEDB CREATEROLE LOGIN;
          END IF;
        END
        $$;
      `);
      console.log('✅ Postgres user ensured');
    } catch (err) {
      // Ignore errors if role already exists or we don't have permission
      console.log('ℹ️  Using existing database configuration');
    }
    
    // Drop and recreate test database
    await pool.query('DROP DATABASE IF EXISTS collaboration_test');
    await pool.query('CREATE DATABASE collaboration_test');
    console.log('✅ Test database created');
    
    await pool.end();
    
    // Connect to test database and create schema
    const testPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: 'collaboration_test',
      user: process.env.DB_USER || currentUser,
      password: process.env.DB_PASSWORD || '',
    });
    
    // Create schema from schema.sql
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');
    await testPool.query(schema);
    console.log('✅ Database schema created');
    
    await testPool.end();
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    console.warn('⚠️  Continuing anyway - unit tests with mocked dependencies can still run');
    console.warn('⚠️  To skip this warning, set SKIP_DB_SETUP=true');
    // Don't throw - allow unit tests to run
  }
  
  // Redis setup - flush test database
  if (process.env.SKIP_DB_SETUP !== 'true') {
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 1, // Use database 1 for tests
    });
    
    try {
      await redis.flushdb();
      console.log('✅ Redis test database flushed');
      await redis.quit();
    } catch (error) {
      console.error('❌ Redis setup failed:', error);
      console.warn('⚠️  Continuing anyway - unit tests with mocked dependencies can still run');
      // Don't throw - tests can run without Redis
    }
  }
  
  console.log('✅ Test environment ready');
}