/**
 * Global Teardown - Runs once after all tests
 * 
 * Cleans up test databases and connections
 */

import { Pool } from 'pg';
import Redis from 'ioredis';

export default async function globalTeardown() {
  console.log('🧹 Cleaning up test environment...');
  
  // Close any remaining Redis connections
  try {
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 1,
    });
    await redis.flushdb();
    await redis.quit();
    console.log('✅ Redis cleaned up');
  } catch (error) {
    console.warn('⚠️ Redis cleanup warning:', error);
  }
  
  // Drop test database (optional - comment out to preserve for debugging)
  const currentUser = process.env.USER || process.env.USERNAME || 'mbhatt';
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres',
    user: process.env.DB_USER || currentUser,
    password: process.env.DB_PASSWORD || '',
  });
  
  try {
    // Terminate all connections to test database
    await pool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = 'collaboration_test'
      AND pid <> pg_backend_pid()
    `);
    
    // Drop test database
    await pool.query('DROP DATABASE IF EXISTS collaboration_test');
    console.log('✅ Test database dropped');
    await pool.end();
  } catch (error) {
    console.warn('⚠️ Database cleanup warning:', error);
  }
  
  console.log('✅ Test environment cleaned up');
}