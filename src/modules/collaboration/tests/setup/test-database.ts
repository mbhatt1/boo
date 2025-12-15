/**
 * Test Database Utilities
 * 
 * Helper functions for test database operations
 */

import { Pool, PoolClient } from 'pg';

let testPool: Pool | null = null;

/**
 * Get or create test database pool
 */
export function getTestPool(): Pool {
  if (!testPool) {
    testPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: 'collaboration_test',
      user: process.env.DB_USER || 'mbhatt',
      password: process.env.DB_PASSWORD || '',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return testPool;
}

/**
 * Close test database pool
 */
export async function closeTestPool(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
}

/**
 * Clear all test data from database
 */
export async function clearTestData(): Promise<void> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Delete in order of dependencies
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM comments');
    await client.query('DELETE FROM presence');
    await client.query('DELETE FROM session_participants');
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM events');
    await client.query('DELETE FROM activities');
    await client.query('DELETE FROM users WHERE username LIKE \'test_%\'');
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute query with automatic connection management
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getTestPool();
  return pool.query(text, params);
}

/**
 * Get a client from the pool for transaction management
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getTestPool();
  return pool.connect();
}

/**
 * Seed test database with common data
 */
export async function seedTestData(): Promise<{
  users: any[];
  sessions: any[];
}> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create test users
    const userResult = await client.query(`
      INSERT INTO users (username, email, password_hash, full_name, role, status)
      VALUES 
        ('test_admin', 'admin@test.com', '$2b$10$test_hash_admin', 'Test Admin', 'admin', 'active'),
        ('test_operator', 'operator@test.com', '$2b$10$test_hash_operator', 'Test Operator', 'operator', 'active'),
        ('test_analyst', 'analyst@test.com', '$2b$10$test_hash_analyst', 'Test Analyst', 'analyst', 'active'),
        ('test_viewer', 'viewer@test.com', '$2b$10$test_hash_viewer', 'Test Viewer', 'viewer', 'active')
      RETURNING *
    `);
    
    // Create test sessions
    const sessionResult = await client.query(`
      INSERT INTO sessions (paper_id, title, created_by, status)
      VALUES 
        ('paper_1', 'Test Session 1', $1, 'active'),
        ('paper_2', 'Test Session 2', $2, 'active')
      RETURNING *
    `, [userResult.rows[0].id, userResult.rows[1].id]);
    
    await client.query('COMMIT');
    
    return {
      users: userResult.rows,
      sessions: sessionResult.rows,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Truncate all tables (faster than DELETE for large datasets)
 */
export async function truncateAllTables(): Promise<void> {
  const pool = getTestPool();
  await pool.query(`
    TRUNCATE TABLE 
      notifications,
      comments,
      presence,
      session_participants,
      sessions,
      events,
      activities,
      users
    RESTART IDENTITY CASCADE
  `);
}