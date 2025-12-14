/**
 * Database Migration Script
 * 
 * This script handles database schema migrations for the collaboration system.
 * It connects to PostgreSQL, applies the schema, and tracks migration versions.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;

// Get current directory (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Database configuration from environment variables
 */
interface MigrationConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

/**
 * Get database configuration from environment
 */
function getConfig(): MigrationConfig {
  return {
    host: process.env.COLLAB_DB_HOST || 'localhost',
    port: parseInt(process.env.COLLAB_DB_PORT || '5432', 10),
    database: process.env.COLLAB_DB_NAME || 'boo_collaboration',
    user: process.env.COLLAB_DB_USER || 'boo_user',
    password: process.env.COLLAB_DB_PASSWORD || 'changeme',
    ssl: process.env.COLLAB_DB_SSL === 'true',
  };
}

/**
 * Migration result interface
 */
interface MigrationResult {
  success: boolean;
  version?: number;
  message: string;
  error?: Error;
}

/**
 * Execute the schema migration
 */
async function runMigration(): Promise<MigrationResult> {
  const config = getConfig();
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
  });

  let client;

  try {
    console.log('🔌 Connecting to database...');
    console.log(`   Host: ${config.host}:${config.port}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);

    client = await pool.connect();
    console.log('✅ Connected to database');

    // Check current schema version
    console.log('\n📋 Checking current schema version...');
    let currentVersion = 0;
    
    try {
      const versionResult = await client.query(
        'SELECT MAX(version) as version FROM schema_version'
      );
      currentVersion = versionResult.rows[0]?.version || 0;
      console.log(`   Current version: ${currentVersion}`);
    } catch (err) {
      console.log('   No schema_version table found (first run)');
    }

    // Read schema file
    console.log('\n📖 Reading schema file...');
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');
    console.log('   Schema file loaded');

    // Execute schema within a transaction
    console.log('\n🔨 Applying schema...');
    await client.query('BEGIN');

    try {
      // Execute the schema SQL
      await client.query(schemaSql);
      
      // Commit transaction
      await client.query('COMMIT');
      console.log('✅ Schema applied successfully');

      // Get new version
      const newVersionResult = await client.query(
        'SELECT MAX(version) as version FROM schema_version'
      );
      const newVersion = newVersionResult.rows[0]?.version || 0;

      return {
        success: true,
        version: newVersion,
        message: `Migration completed successfully. Schema version: ${newVersion}`,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      message: 'Migration failed',
      error: error as Error,
    };
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
    console.log('\n🔌 Database connection closed');
  }
}

/**
 * Verify database connection
 */
async function verifyConnection(): Promise<boolean> {
  const config = getConfig();
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔍 Verifying database connection...');
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    await pool.end();
    
    console.log('✅ Database connection verified');
    console.log(`   Server time: ${result.rows[0].now}`);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

/**
 * Get current schema version
 */
async function getCurrentVersion(): Promise<number | null> {
  const config = getConfig();
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
  });

  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT MAX(version) as version FROM schema_version'
    );
    client.release();
    await pool.end();
    
    const version = result.rows[0]?.version || null;
    return version;
  } catch (error) {
    console.error('Error getting schema version:', error);
    return null;
  }
}

/**
 * Rollback to a previous version (placeholder for future implementation)
 */
async function rollback(targetVersion: number): Promise<MigrationResult> {
  console.log(`⚠️  Rollback to version ${targetVersion} not yet implemented`);
  console.log('   This feature will be added in future versions');
  
  return {
    success: false,
    message: 'Rollback not yet implemented',
  };
}

/**
 * Display migration status
 */
async function showStatus(): Promise<void> {
  console.log('\n📊 Migration Status');
  console.log('='.repeat(50));
  
  const connectionOk = await verifyConnection();
  if (!connectionOk) {
    console.log('❌ Cannot connect to database');
    return;
  }

  const version = await getCurrentVersion();
  if (version === null) {
    console.log('⚠️  Schema not initialized');
  } else {
    console.log(`✅ Schema version: ${version}`);
  }
  
  console.log('='.repeat(50));
}

/**
 * Main CLI handler
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'migrate';

  console.log('\n🗄️  Boo Collaboration Database Migration Tool');
  console.log('='.repeat(50));

  switch (command) {
    case 'migrate':
    case 'up':
      const result = await runMigration();
      if (result.success) {
        console.log(`\n✅ ${result.message}`);
        process.exit(0);
      } else {
        console.error(`\n❌ ${result.message}`);
        if (result.error) {
          console.error('\nError details:', result.error.message);
        }
        process.exit(1);
      }
      break;

    case 'verify':
      const isConnected = await verifyConnection();
      process.exit(isConnected ? 0 : 1);
      break;

    case 'status':
      await showStatus();
      process.exit(0);
      break;

    case 'version':
      const currentVer = await getCurrentVersion();
      if (currentVer === null) {
        console.log('⚠️  Schema not initialized');
        process.exit(1);
      } else {
        console.log(`Schema version: ${currentVer}`);
        process.exit(0);
      }
      break;

    case 'rollback':
      const targetVersion = parseInt(args[1], 10);
      if (isNaN(targetVersion)) {
        console.error('❌ Invalid version number');
        console.log('\nUsage: npm run migrate rollback <version>');
        process.exit(1);
      }
      const rollbackResult = await rollback(targetVersion);
      process.exit(rollbackResult.success ? 0 : 1);
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log('\nUsage: npm run migrate [command]');
      console.log('\nCommands:');
      console.log('  migrate, up     Run pending migrations (default)');
      console.log('  verify          Verify database connection');
      console.log('  status          Show migration status');
      console.log('  version         Show current schema version');
      console.log('  rollback <ver>  Rollback to specific version');
      console.log('  help            Show this help message');
      console.log('\nEnvironment Variables:');
      console.log('  COLLAB_DB_HOST      Database host (default: localhost)');
      console.log('  COLLAB_DB_PORT      Database port (default: 5432)');
      console.log('  COLLAB_DB_NAME      Database name (default: boo_collaboration)');
      console.log('  COLLAB_DB_USER      Database user (default: boo_user)');
      console.log('  COLLAB_DB_PASSWORD  Database password (default: changeme)');
      console.log('  COLLAB_DB_SSL       Use SSL connection (default: false)');
      console.log('\nExamples:');
      console.log('  npm run migrate');
      console.log('  npm run migrate verify');
      console.log('  npm run migrate status');
      console.log('');
      process.exit(0);
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run "npm run migrate help" for usage information');
      process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export functions for programmatic use
export {
  runMigration,
  verifyConnection,
  getCurrentVersion,
  rollback,
  showStatus,
};