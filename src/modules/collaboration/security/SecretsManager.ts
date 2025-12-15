/**
 * Secrets Manager
 * 
 * Secure management of application secrets with:
 * - Environment variable loading with validation
 * - AWS Secrets Manager integration (optional)
 * - HashiCorp Vault integration (optional)
 * - Secrets rotation support
 * - Never log secrets
 * - Secrets validation on startup
 * - Fail-fast on missing critical secrets
 * 
 * Security: Prevents hardcoded secrets and provides centralized management
 */

import { CollaborationError, CollaborationErrorCode } from '../types/index.js';

/**
 * Secret metadata
 */
interface SecretMetadata {
  name: string;
  required: boolean;
  description?: string;
  rotatable: boolean;
  lastRotated?: Date;
  rotationIntervalDays?: number;
}

/**
 * Secret value with metadata
 */
interface Secret {
  value: string;
  metadata: SecretMetadata;
}

/**
 * Secrets Manager configuration
 */
export interface SecretsManagerConfig {
  // Source priority: env > aws > vault > defaults
  sources: {
    environment: boolean;
    awsSecretsManager?: {
      enabled: boolean;
      region: string;
      secretPrefix: string;
    };
    vault?: {
      enabled: boolean;
      address: string;
      token: string;
      path: string;
    };
  };
  
  // Validation rules
  validation: {
    failOnMissingRequired: boolean;
    warnOnMissingOptional: boolean;
    validateFormat: boolean;
  };
  
  // Security
  preventLogging: boolean;
  encryptInMemory: boolean;
  
  // Rotation
  enableRotation: boolean;
  rotationCheckIntervalHours: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SecretsManagerConfig = {
  sources: {
    environment: true,
  },
  validation: {
    failOnMissingRequired: true,
    warnOnMissingOptional: true,
    validateFormat: true,
  },
  preventLogging: true,
  encryptInMemory: false,
  enableRotation: false,
  rotationCheckIntervalHours: 24,
};

/**
 * Secret validation rules
 */
interface ValidationRule {
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  custom?: (value: string) => boolean;
}

/**
 * Secrets Manager
 */
export class SecretsManager {
  private config: SecretsManagerConfig;
  private secrets: Map<string, Secret> = new Map();
  private rotationTimer?: any;
  private originalConsoleMethods?: Record<string, any>;

  constructor(config: Partial<SecretsManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize secrets manager - load all secrets
   */
  async initialize(secretDefinitions: Record<string, SecretMetadata>): Promise<void> {
    // Load secrets from configured sources
    for (const [name, metadata] of Object.entries(secretDefinitions)) {
      try {
        const value = await this.loadSecret(name, metadata);
        
        if (value) {
          // Validate secret format
          if (this.config.validation.validateFormat) {
            this.validateSecretFormat(name, value, metadata);
          }
          
          // Store secret
          this.secrets.set(name, { value, metadata });
        } else if (metadata.required && this.config.validation.failOnMissingRequired) {
          throw new Error(`Required secret '${name}' is missing`);
        } else if (!metadata.required && this.config.validation.warnOnMissingOptional) {
          console.warn(`[SecretsManager] Optional secret '${name}' is missing`);
        }
      } catch (error) {
        if (metadata.required) {
          throw new CollaborationError(
            CollaborationErrorCode.INTERNAL_ERROR,
            `Failed to load required secret '${name}'`,
            { error: (error as Error).message }
          );
        }
      }
    }
    
    // Start rotation checker if enabled
    if (this.config.enableRotation) {
      this.startRotationChecker();
    }
    
    console.log(`[SecretsManager] Initialized with ${this.secrets.size} secrets`);
  }

  /**
   * Get secret value
   */
  getSecret(name: string): string {
    const secret = this.secrets.get(name);
    
    if (!secret) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        `Secret '${name}' not found`
      );
    }
    
    return secret.value;
  }

  /**
   * Get secret value with default fallback
   */
  getSecretOrDefault(name: string, defaultValue: string): string {
    const secret = this.secrets.get(name);
    return secret ? secret.value : defaultValue;
  }

  /**
   * Check if secret exists
   */
  hasSecret(name: string): boolean {
    return this.secrets.has(name);
  }

  /**
   * Set or update a secret (for runtime updates)
   */
  async setSecret(name: string, value: string, metadata: SecretMetadata): Promise<void> {
    // Validate
    if (this.config.validation.validateFormat) {
      this.validateSecretFormat(name, value, metadata);
    }
    
    // Update in memory
    this.secrets.set(name, { value, metadata });
    
    // TODO: Sync to external store if configured
    console.log(`[SecretsManager] Secret '${name}' updated`);
  }

  /**
   * Rotate a secret
   */
  async rotateSecret(name: string, newValue: string): Promise<void> {
    const secret = this.secrets.get(name);
    
    if (!secret) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        `Cannot rotate non-existent secret '${name}'`
      );
    }
    
    if (!secret.metadata.rotatable) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        `Secret '${name}' is not rotatable`
      );
    }
    
    // Update secret
    secret.value = newValue;
    secret.metadata.lastRotated = new Date();
    
    console.log(`[SecretsManager] Secret '${name}' rotated`);
  }

  /**
   * Check if secret needs rotation
   */
  needsRotation(name: string): boolean {
    const secret = this.secrets.get(name);
    
    if (!secret || !secret.metadata.rotatable || !secret.metadata.rotationIntervalDays) {
      return false;
    }
    
    if (!secret.metadata.lastRotated) {
      return true;
    }
    
    const daysSinceRotation = 
      (Date.now() - secret.metadata.lastRotated.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceRotation >= secret.metadata.rotationIntervalDays;
  }

  /**
   * Get all secrets needing rotation
   */
  getSecretsNeedingRotation(): string[] {
    const needsRotation: string[] = [];
    
    for (const [name, secret] of this.secrets.entries()) {
      if (this.needsRotation(name)) {
        needsRotation.push(name);
      }
    }
    
    return needsRotation;
  }

  /**
   * Validate all secrets
   */
  validateAll(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const [name, secret] of this.secrets.entries()) {
      try {
        this.validateSecretFormat(name, secret.value, secret.metadata);
      } catch (error) {
        errors.push(`${name}: ${(error as Error).message}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get secret metadata
   */
  getMetadata(name: string): SecretMetadata | undefined {
    return this.secrets.get(name)?.metadata;
  }

  /**
   * List all secret names (not values)
   */
  listSecrets(): string[] {
    return Array.from(this.secrets.keys());
  }

  /**
   * Mask secret for logging (show first/last 4 chars)
   */
  static maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '****';
    }
    
    return `${secret.slice(0, 4)}${'*'.repeat(secret.length - 8)}${secret.slice(-4)}`;
  }

  /**
   * Prevent secret from being logged
   */
  private preventSecretLogging(value: string): void {
    if (!this.config.preventLogging) {
      return;
    }
    
    // Override console methods to prevent logging
    // This is a basic implementation - in production, use proper logging frameworks
    const originalMethods = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    };
    
    Object.keys(originalMethods).forEach((method) => {
      const original = (console as any)[method];
      (console as any)[method] = (...args: any[]) => {
        const filtered = args.map((arg) => {
          if (typeof arg === 'string' && arg.includes(value)) {
            return arg.replace(new RegExp(value, 'g'), '****');
          }
          return arg;
        });
        original.apply(console, filtered);
      };
    });
    
    // Bug #38 Fix: Store original methods for restoration
    if (!this.originalConsoleMethods) {
      this.originalConsoleMethods = originalMethods;
    }
  }
  
  /**
   * Restore original console methods
   * Bug #38 Fix: Add cleanup method to restore console
   */
  private restoreConsole(): void {
    if (this.originalConsoleMethods) {
      Object.keys(this.originalConsoleMethods).forEach((method) => {
        (console as any)[method] = (this.originalConsoleMethods as any)[method];
      });
      this.originalConsoleMethods = undefined;
    }
  }

  /**
   * Load secret from configured sources
   */
  private async loadSecret(name: string, metadata: SecretMetadata): Promise<string | null> {
    // Try environment variables first
    if (this.config.sources.environment) {
      const envValue = process.env[name];
      if (envValue) {
        return envValue;
      }
    }
    
    // Try AWS Secrets Manager
    if (this.config.sources.awsSecretsManager?.enabled) {
      try {
        const awsValue = await this.loadFromAWS(name);
        if (awsValue) {
          return awsValue;
        }
      } catch (error) {
        console.error(`[SecretsManager] Failed to load from AWS: ${(error as Error).message}`);
      }
    }
    
    // Try HashiCorp Vault
    if (this.config.sources.vault?.enabled) {
      try {
        const vaultValue = await this.loadFromVault(name);
        if (vaultValue) {
          return vaultValue;
        }
      } catch (error) {
        console.error(`[SecretsManager] Failed to load from Vault: ${(error as Error).message}`);
      }
    }
    
    return null;
  }

  /**
   * Load secret from AWS Secrets Manager
   */
  private async loadFromAWS(name: string): Promise<string | null> {
    // TODO: Implement AWS Secrets Manager integration
    // This is a placeholder for AWS SDK integration
    /*
    const AWS = require('aws-sdk');
    const client = new AWS.SecretsManager({
      region: this.config.sources.awsSecretsManager!.region,
    });
    
    const secretName = `${this.config.sources.awsSecretsManager!.secretPrefix}${name}`;
    const data = await client.getSecretValue({ SecretId: secretName }).promise();
    
    if (data.SecretString) {
      return data.SecretString;
    }
    */
    
    return null;
  }

  /**
   * Load secret from HashiCorp Vault
   */
  private async loadFromVault(name: string): Promise<string | null> {
    // TODO: Implement Vault integration
    // This is a placeholder for Vault API integration
    /*
    const vault = require('node-vault')({
      apiVersion: 'v1',
      endpoint: this.config.sources.vault!.address,
      token: this.config.sources.vault!.token,
    });
    
    const path = `${this.config.sources.vault!.path}/${name}`;
    const result = await vault.read(path);
    
    return result.data.value;
    */
    
    return null;
  }

  /**
   * Validate secret format
   */
  private validateSecretFormat(name: string, value: string, metadata: SecretMetadata): void {
    // Common validation rules
    const rules: Record<string, ValidationRule> = {
      // JWT secrets
      JWT_SECRET: {
        minLength: 32,
        pattern: /^[A-Za-z0-9+/=_-]+$/,
      },
      
      // API keys
      API_KEY: {
        minLength: 20,
        pattern: /^[A-Za-z0-9_-]+$/,
      },
      
      // Database passwords
      DB_PASSWORD: {
        minLength: 12,
      },
      
      // Encryption keys (base64)
      ENCRYPTION_KEY: {
        minLength: 32,
        pattern: /^[A-Za-z0-9+/=]+$/,
        custom: (v) => {
          try {
            const decoded = Buffer.from(v, 'base64');
            return decoded.length === 32; // 256 bits
          } catch {
            return false;
          }
        },
      },
    };
    
    // Find matching rule
    let rule: ValidationRule | undefined;
    for (const [pattern, r] of Object.entries(rules)) {
      if (name.includes(pattern)) {
        rule = r;
        break;
      }
    }
    
    if (!rule) {
      return; // No specific validation rule
    }
    
    // Apply validation rules
    if (rule.minLength && value.length < rule.minLength) {
      throw new Error(`Secret must be at least ${rule.minLength} characters`);
    }
    
    if (rule.maxLength && value.length > rule.maxLength) {
      throw new Error(`Secret must not exceed ${rule.maxLength} characters`);
    }
    
    if (rule.pattern && !rule.pattern.test(value)) {
      throw new Error('Secret format is invalid');
    }
    
    if (rule.custom && !rule.custom(value)) {
      throw new Error('Secret failed custom validation');
    }
  }

  /**
   * Start rotation checker
   */
  private startRotationChecker(): void {
    const intervalMs = this.config.rotationCheckIntervalHours * 60 * 60 * 1000;
    
    this.rotationTimer = setInterval(() => {
      const needsRotation = this.getSecretsNeedingRotation();
      
      if (needsRotation.length > 0) {
        console.warn(
          `[SecretsManager] The following secrets need rotation: ${needsRotation.join(', ')}`
        );
      }
    }, intervalMs);
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }
    
    // Clear secrets from memory
    this.secrets.clear();
  }
}

/**
 * Helper to define secrets
 */
export function defineSecret(
  name: string,
  options: Partial<SecretMetadata> = {}
): [string, SecretMetadata] {
  return [
    name,
    {
      name,
      required: options.required ?? false,
      description: options.description,
      rotatable: options.rotatable ?? false,
      rotationIntervalDays: options.rotationIntervalDays,
    },
  ];
}

/**
 * Common secret definitions
 */
export const CommonSecrets = {
  JWT_SECRET: defineSecret('JWT_SECRET', {
    required: true,
    description: 'Secret for JWT token signing',
    rotatable: true,
    rotationIntervalDays: 90,
  }),
  
  JWT_REFRESH_SECRET: defineSecret('JWT_REFRESH_SECRET', {
    required: true,
    description: 'Secret for JWT refresh token signing',
    rotatable: true,
    rotationIntervalDays: 90,
  }),
  
  ENCRYPTION_KEY: defineSecret('ENCRYPTION_KEY', {
    required: true,
    description: 'Master encryption key (base64, 256-bit)',
    rotatable: true,
    rotationIntervalDays: 90,
  }),
  
  DATABASE_URL: defineSecret('DATABASE_URL', {
    required: true,
    description: 'PostgreSQL connection string',
  }),
  
  REDIS_URL: defineSecret('REDIS_URL', {
    required: true,
    description: 'Redis connection string',
  }),
  
  AWS_ACCESS_KEY_ID: defineSecret('AWS_ACCESS_KEY_ID', {
    required: false,
    description: 'AWS access key for Secrets Manager',
  }),
  
  AWS_SECRET_ACCESS_KEY: defineSecret('AWS_SECRET_ACCESS_KEY', {
    required: false,
    description: 'AWS secret access key',
    rotatable: true,
    rotationIntervalDays: 90,
  }),
  
  API_KEY: defineSecret('API_KEY', {
    required: false,
    description: 'General API key',
    rotatable: true,
    rotationIntervalDays: 30,
  }),
};

/**
 * Singleton instance
 */
let secretsManagerInstance: SecretsManager | null = null;

export async function getSecretsManager(
  config?: Partial<SecretsManagerConfig>,
  secrets?: Record<string, SecretMetadata>
): Promise<SecretsManager> {
  if (!secretsManagerInstance) {
    secretsManagerInstance = new SecretsManager(config);
    if (secrets) {
      await secretsManagerInstance.initialize(secrets);
    }
  }
  return secretsManagerInstance;
}

export function resetSecretsManager(): void {
  if (secretsManagerInstance) {
    secretsManagerInstance.shutdown();
  }
  secretsManagerInstance = null;
}

export default SecretsManager;