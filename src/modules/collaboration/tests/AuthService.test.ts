/**
 * AuthService Unit Tests
 * 
 * Tests for authentication service including token generation,
 * validation, user authentication, and permission checking.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthService } from '../services/AuthService.js';
import type { JWTConfig } from '../types/index.js';
import { CollaborationError, CollaborationErrorCode } from '../types/index.js';

// Mock pg Pool
const mockPool = {
  query: jest.fn<any>() as any,
  connect: jest.fn(),
  end: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

describe('AuthService', () => {
  let authService: AuthService;
  const jwtConfig: JWTConfig = {
    secret: 'test-secret-key-at-least-32-characters-long',
    expiresIn: '1h',
    refreshExpiresIn: '7d',
    issuer: 'test-issuer',
    audience: 'test-audience',
  };

  const dbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'test_user',
    password: 'test_password',
  };

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    username: 'testuser',
    email: 'test@example.com',
    password_hash: 'hashed_password',
    full_name: 'Test User',
    role: 'analyst',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    authService = new AuthService(dbConfig, jwtConfig);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await authService.close();
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token for a user', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [mockUser],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      } as any);

      const token = await authService.generateToken(mockUser.id, 'operator');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should throw error if user not found', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      } as any);

      await expect(
        authService.generateToken('nonexistent-id', 'operator')
      ).rejects.toThrow(CollaborationError);
    });

    it('should throw error if user is not active', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, status: 'inactive' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      } as any);

      await expect(
        authService.generateToken(mockUser.id, 'operator')
      ).rejects.toThrow('User account is not active');
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      // First generate a token
      mockPool.query.mockResolvedValueOnce({
        rows: [mockUser],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      } as any);

      const token = await authService.generateToken(mockUser.id, 'operator');

      // Now validate it
      mockPool.query.mockResolvedValueOnce({
        rows: [mockUser],
      });

      const payload = await authService.validateToken(token);

      expect(payload).toBeDefined();
      expect(payload?.userId).toBe(mockUser.id);
      expect(payload?.username).toBe(mockUser.username);
      expect(payload?.role).toBe('operator');
    });

    it('should return null for invalid token', async () => {
      const payload = await authService.validateToken('invalid-token');
      expect(payload).toBeNull();
    });

    it('should throw error for expired token', async () => {
      // Create service with very short expiration
      const shortJwtConfig = { ...jwtConfig, expiresIn: '1ms' };
      const tempService = new AuthService(dbConfig, shortJwtConfig);

      mockPool.query.mockResolvedValueOnce({
        rows: [mockUser],
      });

      const token = await tempService.generateToken(mockUser.id, 'operator');

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      await expect(
        tempService.validateToken(token)
      ).rejects.toThrow('Token has expired');

      await tempService.close();
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate user with correct credentials', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [mockUser],
      });

      // Mock updateLastLogin
      mockPool.query.mockResolvedValueOnce({
        rows: [],
      });

      const user = await authService.authenticateUser('testuser', 'hashed_password');

      expect(user).toBeDefined();
      expect(user?.username).toBe('testuser');
    });

    it('should return null for incorrect username', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
      });

      const user = await authService.authenticateUser('wronguser', 'password');
      expect(user).toBeNull();
    });

    it('should return null for incorrect password', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [mockUser],
      });

      const user = await authService.authenticateUser('testuser', 'wrong-password');
      expect(user).toBeNull();
    });
  });

  describe('hasPermission', () => {
    it('should allow admin all permissions', async () => {
      const adminUser = { ...mockUser, role: 'admin' as any };
      mockPool.query.mockResolvedValueOnce({
        rows: [adminUser],
      });

      const hasPermission = await authService.hasPermission(
        adminUser.id,
        'session:delete'
      );

      expect(hasPermission).toBe(true);
    });

    it('should check role-based permissions correctly', async () => {
      const operatorUser = { ...mockUser, role: 'operator' as any };
      mockPool.query.mockResolvedValueOnce({
        rows: [operatorUser],
      });

      const hasPermission = await authService.hasPermission(
        mockUser.id,
        'session:create'
      );

      expect(hasPermission).toBe(true);
    });

    it('should deny permission for invalid action', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [mockUser],
      });

      const hasPermission = await authService.hasPermission(
        mockUser.id,
        'invalid:action'
      );

      expect(hasPermission).toBe(false);
    });

    it('should return false for inactive user', async () => {
      const inactiveUser = { ...mockUser, status: 'inactive' as any };
      mockPool.query.mockResolvedValueOnce({
        rows: [inactiveUser],
      });

      const hasPermission = await authService.hasPermission(
        mockUser.id,
        'session:join'
      );

      expect(hasPermission).toBe(false);
    });
  });

  describe('refreshToken', () => {
    it('should refresh a valid token', async () => {
      // Mock for initial token generation
      mockPool.query.mockResolvedValueOnce({
        rows: [mockUser],
      });

      const oldToken = await authService.generateToken(mockUser.id, 'operator');

      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock for refresh token - getUserById call
      mockPool.query.mockResolvedValueOnce({
        rows: [mockUser],
      });

      const newToken = await authService.refreshToken(oldToken);

      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(oldToken);
    });

    it('should throw error for invalid token', async () => {
      await expect(
        authService.refreshToken('invalid-token')
      ).rejects.toThrow('Invalid token for refresh');
    });
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const newUser = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'secure-password',
        fullName: 'New User',
      };

      const newUserDb = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        username: newUser.username,
        email: newUser.email,
        password_hash: 'hashed_password',
        full_name: newUser.fullName,
        role: 'analyst',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        last_login: null,
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [newUserDb],
      });

      const user = await authService.createUser(
        newUser.username,
        newUser.email,
        newUser.password,
        newUser.fullName
      );

      expect(user).toBeDefined();
      expect(user.username).toBe(newUser.username);
      expect(user.email).toBe(newUser.email);
    });

    it('should throw error for duplicate username', async () => {
      mockPool.query.mockRejectedValueOnce({
        code: '23505', // Unique violation
      });

      await expect(
        authService.createUser('testuser', 'test@example.com', 'password')
      ).rejects.toThrow('Username or email already exists');
    });
  });
});