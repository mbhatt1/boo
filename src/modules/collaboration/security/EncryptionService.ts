/**
 * Encryption Service
 * 
 * Provides encryption and decryption for sensitive data at rest with:
 * - AES-256-GCM encryption (authenticated encryption)
 * - Per-record encryption keys (data encryption keys)
 * - Master key encryption (key encryption keys)
 * - Key rotation support
 * - AWS KMS integration ready
 * - Secure key storage
 * - Audit logging of encryption/decryption
 * 
 * Security: AES-256-GCM provides both confidentiality and authenticity
 */

import crypto from 'crypto';
import { CollaborationError, CollaborationErrorCode } from '../types/index.js';

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  masterKey: string;              // Base64 encoded 256-bit key
  algorithm: string;               // Default: 'aes-256-gcm'
  keyDerivationIterations: number; // For PBKDF2
  enableKeyRotation: boolean;
  keyRotationDays: number;
  awsKmsKeyId?: string;           // For AWS KMS integration
  enableAuditLogging: boolean;
}

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  ciphertext: string;       // Base64 encoded encrypted data
  iv: string;               // Base64 encoded initialization vector
  authTag: string;          // Base64 encoded authentication tag
  keyVersion: number;       // Key version for rotation support
  algorithm: string;        // Algorithm used
  encrypted: boolean;       // Flag to indicate encrypted state
}

/**
 * Decrypted data result
 */
export interface DecryptedData {
  plaintext: string;
  keyVersion: number;
}

/**
 * Key metadata
 */
interface KeyMetadata {
  version: number;
  createdAt: Date;
  rotatedAt?: Date;
  status: 'active' | 'deprecated' | 'revoked';
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<EncryptionConfig> = {
  algorithm: 'aes-256-gcm',
  keyDerivationIterations: 100000,
  enableKeyRotation: true,
  keyRotationDays: 90,
  enableAuditLogging: true,
};

/**
 * Encryption Service
 */
export class EncryptionService {
  private config: EncryptionConfig;
  private masterKey: any; // BufferLike
  private currentKeyVersion: number = 1;
  private keyHistory: Map<number, KeyMetadata> = new Map();
  private derivedKeys: Map<number, any> = new Map(); // Map<number, BufferLike>

  constructor(config: EncryptionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as EncryptionConfig;
    
    // Validate master key
    this.validateMasterKey(this.config.masterKey);
    
    // Store master key
    this.masterKey = Buffer.from(this.config.masterKey, 'base64');
    
    // Initialize current key
    this.initializeKey(this.currentKeyVersion);
    
    // Setup key rotation if enabled
    if (this.config.enableKeyRotation) {
      this.setupKeyRotation();
    }
  }

  /**
   * Encrypt data
   */
  encrypt(plaintext: string, context?: Record<string, any>): EncryptedData {
    try {
      // Get current encryption key
      const key = this.getKey(this.currentKeyVersion);
      
      // Generate random IV (12 bytes for GCM)
      const iv = crypto.randomBytes(12);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.config.algorithm, key, iv) as any;
      
      // Add additional authenticated data (AAD) if context provided
      if (context) {
        const aad = Buffer.from(JSON.stringify(context));
        cipher.setAAD(aad);
      }
      
      // Encrypt
      let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
      ciphertext += cipher.final('base64');
      
      // Get auth tag
      const authTag = cipher.getAuthTag();
      
      // Log encryption (if enabled)
      if (this.config.enableAuditLogging) {
        this.logEncryption(context);
      }
      
      return {
        ciphertext,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        keyVersion: this.currentKeyVersion,
        algorithm: this.config.algorithm,
        encrypted: true,
      };
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Encryption failed',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Decrypt data
   */
  decrypt(encryptedData: EncryptedData, context?: Record<string, any>): string {
    // Validate encrypted data
    if (!encryptedData.encrypted) {
      throw new CollaborationError(
        CollaborationErrorCode.INVALID_MESSAGE,
        'Data is not encrypted'
      );
    }
    
    try {
      // Get encryption key for the version used
      const key = this.getKey(encryptedData.keyVersion);
      
      // Convert from base64
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const authTag = Buffer.from(encryptedData.authTag, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipheriv(encryptedData.algorithm, key, iv) as any;
      
      // Set auth tag
      decipher.setAuthTag(authTag);
      
      // Add additional authenticated data (AAD) if context provided
      if (context) {
        const aad = Buffer.from(JSON.stringify(context));
        decipher.setAAD(aad);
      }
      
      // Decrypt
      let plaintext = decipher.update(encryptedData.ciphertext, 'base64', 'utf8');
      plaintext += decipher.final('utf8');
      
      // Log decryption (if enabled)
      if (this.config.enableAuditLogging) {
        this.logDecryption(context);
      }
      
      return plaintext;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Decryption failed',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Encrypt sensitive fields in an object
   */
  encryptFields(obj: Record<string, any>, fields: string[]): Record<string, any> {
    const result = { ...obj };
    
    for (const field of fields) {
      if (result[field] !== undefined && result[field] !== null) {
        const plaintext = typeof result[field] === 'string'
          ? result[field]
          : JSON.stringify(result[field]);
        
        result[field] = this.encrypt(plaintext, { field });
      }
    }
    
    return result;
  }

  /**
   * Decrypt sensitive fields in an object
   */
  decryptFields(obj: Record<string, any>, fields: string[]): Record<string, any> {
    const result = { ...obj };
    
    for (const field of fields) {
      if (result[field] && typeof result[field] === 'object' && result[field].encrypted) {
        const plaintext = this.decrypt(result[field], { field });
        
        // Try to parse JSON if it was stringified
        try {
          result[field] = JSON.parse(plaintext);
        } catch {
          result[field] = plaintext;
        }
      }
    }
    
    return result;
  }

  /**
   * Generate a data encryption key (DEK)
   * Used for per-record encryption
   */
  generateDataKey(): { plainKey: any; encryptedKey: string } {
    try {
      // Generate random 256-bit key
      const plainKey = crypto.randomBytes(32);
      
      // Encrypt the key with master key
      const encryptedKeyData = this.encrypt(plainKey.toString('base64'));
      const encryptedKey = JSON.stringify(encryptedKeyData);
      
      return {
        plainKey,
        encryptedKey,
      };
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Failed to generate data key',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Decrypt a data encryption key
   */
  decryptDataKey(encryptedKey: string): any {
    try {
      const encryptedData: EncryptedData = JSON.parse(encryptedKey);
      const plainKeyBase64 = this.decrypt(encryptedData);
      return Buffer.from(plainKeyBase64, 'base64');
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Failed to decrypt data key',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Hash sensitive data (one-way)
   * Used for passwords, tokens, etc.
   */
  hash(data: string, salt?: string): { hash: string; salt: string } {
    try {
      const actualSalt = salt || crypto.randomBytes(16).toString('base64');
      const saltBuffer = Buffer.from(actualSalt, 'base64');
      
      // Use PBKDF2 for key derivation
      const hash = crypto.pbkdf2Sync(
        data,
        saltBuffer,
        this.config.keyDerivationIterations,
        64,
        'sha512'
      );
      
      return {
        hash: hash.toString('base64'),
        salt: actualSalt,
      };
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Hashing failed',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Verify hashed data
   */
  verifyHash(data: string, hash: string, salt: string): boolean {
    try {
      const computed = this.hash(data, salt);
      return computed.hash === hash;
    } catch (error) {
      return false;
    }
  }

  /**
   * Rotate encryption key
   */
  rotateKey(): number {
    try {
      // Mark current key as deprecated
      const currentMetadata = this.keyHistory.get(this.currentKeyVersion);
      if (currentMetadata) {
        currentMetadata.status = 'deprecated';
        currentMetadata.rotatedAt = new Date();
      }
      
      // Create new key version
      const newVersion = this.currentKeyVersion + 1;
      this.initializeKey(newVersion);
      this.currentKeyVersion = newVersion;
      
      console.log(`[EncryptionService] Key rotated to version ${newVersion}`);
      
      return newVersion;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Key rotation failed',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Re-encrypt data with new key version
   */
  reEncrypt(encryptedData: EncryptedData, context?: Record<string, any>): EncryptedData {
    try {
      // Decrypt with old key
      const plaintext = this.decrypt(encryptedData, context);
      
      // Encrypt with current key
      return this.encrypt(plaintext, context);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Re-encryption failed',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Get current key version
   */
  getCurrentKeyVersion(): number {
    return this.currentKeyVersion;
  }

  /**
   * Get key metadata
   */
  getKeyMetadata(version: number): KeyMetadata | undefined {
    return this.keyHistory.get(version);
  }

  /**
   * Check if key rotation is needed
   */
  isKeyRotationNeeded(): boolean {
    const metadata = this.keyHistory.get(this.currentKeyVersion);
    if (!metadata) return false;
    
    const daysSinceCreation = (Date.now() - metadata.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCreation >= this.config.keyRotationDays;
  }

  /**
   * Validate master key format
   */
  private validateMasterKey(key: string): void {
    try {
      const keyBuffer = Buffer.from(key, 'base64');
      
      // Must be 256 bits (32 bytes) for AES-256
      if (keyBuffer.length !== 32) {
        throw new Error('Master key must be 256 bits (32 bytes)');
      }
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Invalid master key format',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Initialize encryption key for a version
   */
  private initializeKey(version: number): void {
    try {
      // Derive key from master key using version as context
      const versionBuffer = Buffer.from(version.toString());
      const derivedKey = crypto.pbkdf2Sync(
        this.masterKey,
        versionBuffer,
        this.config.keyDerivationIterations,
        32,
        'sha256'
      );
      
      // Store derived key
      this.derivedKeys.set(version, derivedKey);
      
      // Store metadata
      this.keyHistory.set(version, {
        version,
        createdAt: new Date(),
        status: 'active',
      });
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Key initialization failed',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Get encryption key for a version
   */
  private getKey(version: number): any {
    const key = this.derivedKeys.get(version);
    
    if (!key) {
      // Try to initialize if not found (for backward compatibility)
      this.initializeKey(version);
      const newKey = this.derivedKeys.get(version);
      
      if (!newKey) {
        throw new CollaborationError(
          CollaborationErrorCode.INTERNAL_ERROR,
          `Encryption key not found for version ${version}`
        );
      }
      
      return newKey;
    }
    
    return key;
  }

  /**
   * Setup automatic key rotation
   */
  private setupKeyRotation(): void {
    // Check daily for key rotation
    setInterval(() => {
      if (this.isKeyRotationNeeded()) {
        try {
          this.rotateKey();
        } catch (error) {
          console.error('[EncryptionService] Automatic key rotation failed:', error);
        }
      }
    }, 86400000); // 24 hours
  }

  /**
   * Log encryption operation
   */
  private logEncryption(context?: Record<string, any>): void {
    // This would integrate with AuditLogger
    // For now, just console log
    if (process.env.NODE_ENV === 'development') {
      console.log('[EncryptionService] Data encrypted', {
        keyVersion: this.currentKeyVersion,
        context: context || {},
      });
    }
  }

  /**
   * Log decryption operation
   */
  private logDecryption(context?: Record<string, any>): void {
    // This would integrate with AuditLogger
    // For now, just console log
    if (process.env.NODE_ENV === 'development') {
      console.log('[EncryptionService] Data decrypted', {
        context: context || {},
      });
    }
  }

  /**
   * Generate a secure master key (static utility)
   */
  static generateMasterKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  /**
   * Securely wipe sensitive data from memory
   */
  static wipeBuffer(buffer: any): void {
    buffer.fill(0);
  }
}

/**
 * Singleton instance
 */
let encryptionServiceInstance: EncryptionService | null = null;

export function getEncryptionService(config?: EncryptionConfig): EncryptionService {
  if (!encryptionServiceInstance) {
    if (!config) {
      throw new Error('EncryptionService not initialized. Provide configuration.');
    }
    encryptionServiceInstance = new EncryptionService(config);
  }
  return encryptionServiceInstance;
}

export function resetEncryptionService(): void {
  encryptionServiceInstance = null;
}

export default EncryptionService;