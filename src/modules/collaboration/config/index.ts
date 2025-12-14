/**
 * Collaboration System Configuration
 * 
 * Central configuration management for the real-time collaboration system.
 * All configuration is loaded from environment variables with sensible defaults.
 */

import type {
  CollaborationConfig,
  WebSocketServerConfig,
  DatabaseConfig,
  RedisConfig,
  JWTConfig,
} from '../types/index.js';

/**
 * Load WebSocket server configuration from environment
 */
function loadServerConfig(): WebSocketServerConfig {
  return {
    port: parseInt(process.env.COLLAB_WS_PORT || '8080', 10),
    host: process.env.COLLAB_WS_HOST || '0.0.0.0',
    path: process.env.COLLAB_WS_PATH || '/collaboration',
    pingInterval: parseInt(process.env.COLLAB_WS_PING_INTERVAL || '30000', 10),
    pingTimeout: parseInt(process.env.COLLAB_WS_PING_TIMEOUT || '5000', 10),
    maxConnections: parseInt(process.env.COLLAB_WS_MAX_CONNECTIONS || '1000', 10),
  };
}

/**
 * Load database configuration from environment
 */
function loadDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.COLLAB_DB_HOST || 'localhost',
    port: parseInt(process.env.COLLAB_DB_PORT || '5432', 10),
    database: process.env.COLLAB_DB_NAME || 'boo_collaboration',
    user: process.env.COLLAB_DB_USER || 'boo_user',
    password: process.env.COLLAB_DB_PASSWORD || 'changeme',
    ssl: process.env.COLLAB_DB_SSL === 'true',
    maxConnections: parseInt(process.env.COLLAB_DB_MAX_CONNECTIONS || '20', 10),
    idleTimeout: parseInt(process.env.COLLAB_DB_IDLE_TIMEOUT || '30000', 10),
  };
}

/**
 * Load Redis configuration from environment
 */
function loadRedisConfig(): RedisConfig {
  return {
    host: process.env.COLLAB_REDIS_HOST || 'localhost',
    port: parseInt(process.env.COLLAB_REDIS_PORT || '6379', 10),
    password: process.env.COLLAB_REDIS_PASSWORD,
    db: parseInt(process.env.COLLAB_REDIS_DB || '0', 10),
    keyPrefix: process.env.COLLAB_REDIS_PREFIX || 'collab:',
    ttl: parseInt(process.env.COLLAB_REDIS_TTL || '3600', 10),
  };
}

/**
 * Load JWT configuration from environment
 */
function loadJWTConfig(): JWTConfig {
  // Require JWT secret in production
  const secret = process.env.COLLAB_JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('COLLAB_JWT_SECRET must be set in production');
  }

  return {
    secret: secret || 'dev-secret-change-in-production',
    expiresIn: process.env.COLLAB_JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.COLLAB_JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.COLLAB_JWT_ISSUER || 'boo-collaboration',
    audience: process.env.COLLAB_JWT_AUDIENCE || 'boo-users',
  };
}

/**
 * Load event streaming configuration from environment
 */
function loadEventStreamingConfig(): import('../types/index.js').EventStreamingConfig {
  return {
    enabled: process.env.COLLAB_EVENT_STREAMING_ENABLED !== 'false',
    maxEventsPerOperation: parseInt(process.env.COLLAB_MAX_EVENTS_PER_OP || '1000', 10),
    eventRetentionHours: parseInt(process.env.COLLAB_EVENT_RETENTION_HOURS || '24', 10),
    rateLimitPerSecond: parseInt(process.env.COLLAB_EVENT_RATE_LIMIT || '1000', 10),
    deduplicationWindowMs: parseInt(process.env.COLLAB_DEDUPE_WINDOW_MS || '5000', 10),
    bufferSize: parseInt(process.env.COLLAB_EVENT_BUFFER_SIZE || '100', 10),
  };
}

/**
 * Load HTTP API configuration from environment
 */
function loadHttpApiConfig(): import('../types/index.js').HttpApiConfig {
  const apiKeysEnv = process.env.COLLAB_API_KEYS || '';
  const apiKeys = apiKeysEnv ? apiKeysEnv.split(',').map(k => k.trim()) : ['dev-api-key-change-in-production'];
  
  return {
    enabled: process.env.COLLAB_HTTP_API_ENABLED === 'true',
    port: parseInt(process.env.COLLAB_HTTP_API_PORT || '8081', 10),
    apiKeyHeader: process.env.COLLAB_API_KEY_HEADER || 'X-API-Key',
    apiKeys,
    rateLimitPerMinute: parseInt(process.env.COLLAB_API_RATE_LIMIT || '100', 10),
    maxRequestSize: process.env.COLLAB_MAX_REQUEST_SIZE || '10mb',
  };
}

/**
 * Load complete collaboration configuration
 */
export function loadConfig(): CollaborationConfig {
  return {
    server: loadServerConfig(),
    database: loadDatabaseConfig(),
    redis: loadRedisConfig(),
    jwt: loadJWTConfig(),
    eventStreaming: loadEventStreamingConfig(),
    httpApi: loadHttpApiConfig(),
    enableLogging: process.env.COLLAB_ENABLE_LOGGING !== 'false',
    logLevel: (process.env.COLLAB_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  };
}

/**
 * Validate configuration
 * Throws an error if configuration is invalid
 */
export function validateConfig(config: CollaborationConfig): void {
  const errors: string[] = [];

  // Validate server config
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push(`Invalid server port: ${config.server.port}`);
  }
  if (config.server.pingInterval < 1000) {
    errors.push('Ping interval must be at least 1000ms');
  }
  if (config.server.maxConnections < 1) {
    errors.push('Max connections must be at least 1');
  }

  // Validate database config
  if (!config.database.host) {
    errors.push('Database host is required');
  }
  if (!config.database.database) {
    errors.push('Database name is required');
  }
  if (!config.database.user) {
    errors.push('Database user is required');
  }
  if (config.database.maxConnections < 1) {
    errors.push('Database max connections must be at least 1');
  }

  // Validate Redis config
  if (!config.redis.host) {
    errors.push('Redis host is required');
  }
  if (config.redis.port < 1 || config.redis.port > 65535) {
    errors.push(`Invalid Redis port: ${config.redis.port}`);
  }

  // Validate JWT config
  if (!config.jwt.secret) {
    errors.push('JWT secret is required');
  }
  if (config.jwt.secret.length < 32 && process.env.NODE_ENV === 'production') {
    errors.push('JWT secret must be at least 32 characters in production');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Get singleton configuration instance
 * Configuration is loaded once and cached
 */
let cachedConfig: CollaborationConfig | null = null;

export function getConfig(): CollaborationConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
    validateConfig(cachedConfig);
  }
  return cachedConfig;
}

/**
 * Reset cached configuration (useful for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Print configuration summary (without sensitive data)
 */
export function printConfigSummary(config?: CollaborationConfig): void {
  const cfg = config || getConfig();
  
  console.log('\n📋 Collaboration System Configuration');
  console.log('='.repeat(50));
  
  console.log('\n🌐 WebSocket Server:');
  console.log(`   Host: ${cfg.server.host}`);
  console.log(`   Port: ${cfg.server.port}`);
  console.log(`   Path: ${cfg.server.path}`);
  console.log(`   Ping Interval: ${cfg.server.pingInterval}ms`);
  console.log(`   Max Connections: ${cfg.server.maxConnections}`);
  
  console.log('\n🗄️  Database:');
  console.log(`   Host: ${cfg.database.host}:${cfg.database.port}`);
  console.log(`   Database: ${cfg.database.database}`);
  console.log(`   User: ${cfg.database.user}`);
  console.log(`   SSL: ${cfg.database.ssl ? 'enabled' : 'disabled'}`);
  console.log(`   Max Connections: ${cfg.database.maxConnections}`);
  
  console.log('\n🔴 Redis:');
  console.log(`   Host: ${cfg.redis.host}:${cfg.redis.port}`);
  console.log(`   Database: ${cfg.redis.db}`);
  console.log(`   Key Prefix: ${cfg.redis.keyPrefix}`);
  console.log(`   TTL: ${cfg.redis.ttl}s`);
  console.log(`   Password: ${cfg.redis.password ? '***' : 'none'}`);
  
  console.log('\n🔐 JWT:');
  console.log(`   Issuer: ${cfg.jwt.issuer}`);
  console.log(`   Audience: ${cfg.jwt.audience}`);
  console.log(`   Expires In: ${cfg.jwt.expiresIn}`);
  console.log(`   Refresh Expires In: ${cfg.jwt.refreshExpiresIn}`);
  console.log(`   Secret: ${cfg.jwt.secret.substring(0, 4)}***`);
  
  console.log('\n📊 General:');
  console.log(`   Logging: ${cfg.enableLogging ? 'enabled' : 'disabled'}`);
  console.log(`   Log Level: ${cfg.logLevel}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  
  console.log('\n' + '='.repeat(50));
}

/**
 * Export individual config loaders for testing
 */
export {
  loadServerConfig,
  loadDatabaseConfig,
  loadRedisConfig,
  loadJWTConfig,
  loadEventStreamingConfig,
  loadHttpApiConfig,
};

/**
 * Default export
 */
export default {
  loadConfig,
  getConfig,
  validateConfig,
  resetConfig,
  printConfigSummary,
};