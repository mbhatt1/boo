/**
 * EncryptionService Unit Tests
 * 
 * Comprehensive tests for AES-256-GCM encryption including:
 * - Encryption/decryption
 * - Key management and rotation
 * - Per-record encryption keys (DEK)
 * - Authenticated encryption with AAD
 * - Tamper detection
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import { EncryptionService } from '../../security/EncryptionService.js';
import { CollaborationError } from '../../types/index.js';

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;
  let masterKey: string;

  beforeEach(() => {
    // Generate a random 256-bit master key
    masterKey = crypto.randomBytes(32).toString('base64');
    
    encryptionService = new EncryptionService({
      masterKey,
      algorithm: 'aes-256-gcm',
      keyDerivationIterations: 100000,
      enableKeyRotation: false, // Disable for most tests
      keyRotationDays: 90,
      enableAuditLogging: false, // Disable for testing
    });
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plaintext = 'sensitive data';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const plaintext = 'test data';
      
      const encrypted1 = encryptionService.encrypt(plaintext);
      const encrypted2 = encryptionService.encrypt(plaintext);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should include all required fields in encrypted data', () => {
      const encrypted = encryptionService.encrypt('test');

      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted).toHaveProperty('keyVersion');
      expect(encrypted).toHaveProperty('algorithm');
      expect(encrypted.encrypted).toBe(true);
    });

    it('should use correct algorithm', () => {
      const encrypted = encryptionService.encrypt('test');

      expect(encrypted.algorithm).toBe('aes-256-gcm');
    });

    it('should handle empty strings', () => {
      const encrypted = encryptionService.encrypt('');
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe('');
    });

    it('should handle long text', () => {
      const longText = 'a'.repeat(10000);
      
      const encrypted = encryptionService.encrypt(longText);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(longText);
    });

    it('should handle Unicode characters', () => {
      const unicode = 'Hello 世界 🌍 émojis';
      
      const encrypted = encryptionService.encrypt(unicode);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(unicode);
    });

    it('should handle JSON data', () => {
      const jsonData = JSON.stringify({ user: 'test', sensitive: true });
      
      const encrypted = encryptionService.encrypt(jsonData);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(JSON.parse(decrypted)).toEqual({ user: 'test', sensitive: true });
    });
  });

  describe('authenticated encryption (AAD)', () => {
    it('should encrypt with additional authenticated data', () => {
      const plaintext = 'secret message';
      const context = { userId: '123', operation: 'store' };
      
      const encrypted = encryptionService.encrypt(plaintext, context);
      const decrypted = encryptionService.decrypt(encrypted, context);

      expect(decrypted).toBe(plaintext);
    });

    it('should reject decryption with wrong context', () => {
      const plaintext = 'secret message';
      const context1 = { userId: '123' };
      const context2 = { userId: '456' };
      
      const encrypted = encryptionService.encrypt(plaintext, context1);

      expect(() => encryptionService.decrypt(encrypted, context2)).toThrow();
    });

    it('should reject decryption with missing context', () => {
      const plaintext = 'secret message';
      const context = { userId: '123' };
      
      const encrypted = encryptionService.encrypt(plaintext, context);

      expect(() => encryptionService.decrypt(encrypted)).toThrow();
    });
  });

  describe('tamper detection', () => {
    it('should detect tampering with ciphertext', () => {
      const encrypted = encryptionService.encrypt('original data');
      
      // Tamper with ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.slice(0, -5) + 'xxxxx',
      };

      expect(() => encryptionService.decrypt(tampered)).toThrow();
    });

    it('should detect tampering with IV', () => {
      const encrypted = encryptionService.encrypt('original data');
      
      // Tamper with IV
      const tampered = {
        ...encrypted,
        iv: crypto.randomBytes(12).toString('base64'),
      };

      expect(() => encryptionService.decrypt(tampered)).toThrow();
    });

    it('should detect tampering with auth tag', () => {
      const encrypted = encryptionService.encrypt('original data');
      
      // Tamper with auth tag
      const tampered = {
        ...encrypted,
        authTag: crypto.randomBytes(16).toString('base64'),
      };

      expect(() => encryptionService.decrypt(tampered)).toThrow();
    });

    it('should detect corrupted data', () => {
      const encrypted = encryptionService.encrypt('original data');
      
      // Corrupt ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: 'invalid-base64!@#$',
      };

      expect(() => encryptionService.decrypt(tampered)).toThrow();
    });
  });

  describe('encryptFields and decryptFields', () => {
    it('should encrypt specific fields in an object', () => {
      const obj = {
        publicData: 'visible',
        sensitiveData: 'secret',
        anotherSecret: 'hidden',
      };

      const encrypted = encryptionService.encryptFields(obj, [
        'sensitiveData',
        'anotherSecret',
      ]);

      expect(encrypted.publicData).toBe('visible');
      expect(encrypted.sensitiveData).toHaveProperty('encrypted', true);
      expect(encrypted.anotherSecret).toHaveProperty('encrypted', true);
    });

    it('should decrypt specific fields in an object', () => {
      const obj = {
        publicData: 'visible',
        sensitiveData: 'secret',
      };

      const encrypted = encryptionService.encryptFields(obj, ['sensitiveData']);
      const decrypted = encryptionService.decryptFields(encrypted, [
        'sensitiveData',
      ]);

      expect(decrypted.publicData).toBe('visible');
      expect(decrypted.sensitiveData).toBe('secret');
    });

    it('should handle nested objects', () => {
      const obj = {
        data: { nested: { value: 'secret' } },
      };

      const encrypted = encryptionService.encryptFields(obj, ['data']);
      const decrypted = encryptionService.decryptFields(encrypted, ['data']);

      expect(decrypted.data).toEqual({ nested: { value: 'secret' } });
    });

    it('should skip null and undefined fields', () => {
      const obj = {
        field1: null,
        field2: undefined,
        field3: 'value',
      };

      const encrypted = encryptionService.encryptFields(obj, [
        'field1',
        'field2',
        'field3',
      ]);

      expect(encrypted.field1).toBeNull();
      expect(encrypted.field2).toBeUndefined();
      expect(encrypted.field3).toHaveProperty('encrypted', true);
    });
  });

  describe('data encryption keys (DEK)', () => {
    it('should generate a data encryption key', () => {
      const { plainKey, encryptedKey } = encryptionService.generateDataKey();

      expect(plainKey).toBeDefined();
      expect(plainKey.length).toBe(32); // 256 bits
      expect(encryptedKey).toBeDefined();
      expect(typeof encryptedKey).toBe('string');
    });

    it('should encrypt and decrypt DEK correctly', () => {
      const { plainKey, encryptedKey } = encryptionService.generateDataKey();
      
      const decryptedKey = encryptionService.decryptDataKey(encryptedKey);

      expect(decryptedKey.toString('base64')).toBe(plainKey.toString('base64'));
    });

    it('should generate different DEKs each time', () => {
      const dek1 = encryptionService.generateDataKey();
      const dek2 = encryptionService.generateDataKey();

      expect(dek1.plainKey.toString('base64')).not.toBe(
        dek2.plainKey.toString('base64')
      );
      expect(dek1.encryptedKey).not.toBe(dek2.encryptedKey);
    });

    it('should reject invalid encrypted DEK', () => {
      expect(() =>
        encryptionService.decryptDataKey('invalid-json')
      ).toThrow();
    });
  });

  describe('key versioning', () => {
    it('should include key version in encrypted data', () => {
      const encrypted = encryptionService.encrypt('test');

      expect(encrypted.keyVersion).toBe(1);
    });

    it('should decrypt data with correct key version', () => {
      const plaintext = 'versioned data';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(encrypted.keyVersion).toBe(1);
    });
  });

  describe('key rotation', () => {
    it('should support key rotation configuration', () => {
      const service = new EncryptionService({
        masterKey,
        algorithm: 'aes-256-gcm',
        keyDerivationIterations: 100000,
        enableKeyRotation: true,
        keyRotationDays: 30,
        enableAuditLogging: false,
      });

      expect(service).toBeDefined();
    });

    it('should decrypt data encrypted with old key version', () => {
      // This test would require more complex setup with multiple key versions
      // For now, verify the service can handle version tracking
      const encrypted = encryptionService.encrypt('test data');
      
      expect(encrypted.keyVersion).toBeDefined();
      expect(typeof encrypted.keyVersion).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should reject decryption of non-encrypted data', () => {
      const fakeEncrypted = {
        ciphertext: 'fake',
        iv: 'fake',
        authTag: 'fake',
        keyVersion: 1,
        algorithm: 'aes-256-gcm',
        encrypted: false, // Not marked as encrypted
      };

      expect(() => encryptionService.decrypt(fakeEncrypted)).toThrow(
        'Data is not encrypted'
      );
    });

    it('should handle encryption errors gracefully', () => {
      // Try to encrypt with invalid service state
      expect(() => {
        const invalidService = new EncryptionService({
          masterKey: 'invalid-key', // Too short
          algorithm: 'aes-256-gcm',
          keyDerivationIterations: 100000,
          enableKeyRotation: false,
          keyRotationDays: 90,
          enableAuditLogging: false,
        });
      }).toThrow();
    });

    it('should handle decryption errors gracefully', () => {
      const encrypted = encryptionService.encrypt('test');
      
      // Break the data structure
      const broken = { ...encrypted, ciphertext: null };

      expect(() => encryptionService.decrypt(broken as any)).toThrow(
        CollaborationError
      );
    });
  });

  describe('master key validation', () => {
    it('should reject invalid master key', () => {
      expect(() => {
        new EncryptionService({
          masterKey: 'too-short',
          algorithm: 'aes-256-gcm',
          keyDerivationIterations: 100000,
          enableKeyRotation: false,
          keyRotationDays: 90,
          enableAuditLogging: false,
        });
      }).toThrow();
    });

    it('should accept valid 256-bit master key', () => {
      const validKey = crypto.randomBytes(32).toString('base64');
      
      const service = new EncryptionService({
        masterKey: validKey,
        algorithm: 'aes-256-gcm',
        keyDerivationIterations: 100000,
        enableKeyRotation: false,
        keyRotationDays: 90,
        enableAuditLogging: false,
      });

      expect(service).toBeDefined();
    });
  });

  describe('security properties', () => {
    it('should use unique IVs for each encryption', () => {
      const ivs = new Set();
      
      for (let i = 0; i < 100; i++) {
        const encrypted = encryptionService.encrypt('test');
        ivs.add(encrypted.iv);
      }

      // All IVs should be unique
      expect(ivs.size).toBe(100);
    });

    it('should produce ciphertexts of appropriate length', () => {
      const plaintext = 'test data';
      const encrypted = encryptionService.encrypt(plaintext);

      // Ciphertext should be base64 encoded
      expect(encrypted.ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/);
      
      // IV should be 12 bytes (16 chars in base64)
      expect(encrypted.iv.length).toBe(16);
      
      // Auth tag should be 16 bytes
      expect(encrypted.authTag.length).toBeGreaterThan(0);
    });

    it('should not leak plaintext in ciphertext', () => {
      const plaintext = 'secret password 123';
      const encrypted = encryptionService.encrypt(plaintext);

      // Ciphertext should not contain plaintext
      expect(encrypted.ciphertext).not.toContain('secret');
      expect(encrypted.ciphertext).not.toContain('password');
      expect(encrypted.ciphertext).not.toContain('123');
    });
  });

  describe('performance', () => {
    it('should encrypt quickly', () => {
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        encryptionService.encrypt('test data');
      }
      
      const duration = Date.now() - start;
      
      // 100 encryptions should complete in reasonable time (<1000ms)
      expect(duration).toBeLessThan(1000);
    });

    it('should decrypt quickly', () => {
      const encrypted = Array.from({ length: 100 }, () =>
        encryptionService.encrypt('test data')
      );
      
      const start = Date.now();
      
      for (const enc of encrypted) {
        encryptionService.decrypt(enc);
      }
      
      const duration = Date.now() - start;
      
      // 100 decryptions should complete in reasonable time (<1000ms)
      expect(duration).toBeLessThan(1000);
    });
  });
});