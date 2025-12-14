/**
 * Global Setup - Runs once before all tests
 * 
 * Initializes test databases, Redis, and other shared resources
 */

import { Pool } from 'pg';
import Redis from 'ioredis';

export default async function globalSetup() {
  console.log('🚀 Setting up test environment...');
  
  // Database setup
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres', // Connect to postgres to create test db
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });
  
  try {
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
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });
    
    // Create schema from schema.sql
    const fs = await import('fs/promises');
    const path = await import('path');
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');
    await testPool.query(schema);
    console.log('✅ Database schema created');
    
    await testPool.end();
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  }
  
  // Redis setup - flush test database
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
    // Don't throw - tests can run without Redis
  }
  
  console.log('✅ Test environment ready');
}