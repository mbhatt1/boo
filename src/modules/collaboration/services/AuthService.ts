/**
 * Authentication Service
 * 
 * Handles JWT token generation, validation, user authentication,
 * and role-based access control for the collaboration system.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pg from 'pg';
import type {
  IAuthService,
  TokenPayload,
  User,
  UserRole,
  JWTConfig,
} from '../types/index.js';
import { CollaborationError, CollaborationErrorCode } from '../types/index.js';

const { Pool } = pg;

/**
 * Authentication Service Implementation
 */
export class AuthService implements IAuthService {
  private pool: pg.Pool;
  private jwtConfig: JWTConfig;

  constructor(dbConfig: pg.PoolConfig, jwtConfig: JWTConfig) {
    this.pool = new Pool(dbConfig);
    this.jwtConfig = jwtConfig;
  }

  /**
   * Generate a JWT token for a user
   */
  async generateToken(userId: string, role: UserRole): Promise<string> {
    try {
      // Get user from database to ensure they exist and are active
      const user = await this.getUserById(userId);
      if (!user) {
        throw new CollaborationError(
          CollaborationErrorCode.AUTHENTICATION_FAILED,
          'User not found'
        );
      }

      if (user.status !== 'active') {
        throw new CollaborationError(
          CollaborationErrorCode.AUTHENTICATION_FAILED,
          'User account is not active'
        );
      }

      // Create token payload
      const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
        userId: user.id,
        username: user.username,
        role: role,
      };

      // Generate token
      const token = jwt.sign(payload, this.jwtConfig.secret, {
        expiresIn: this.jwtConfig.expiresIn as string | number,
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
      } as jwt.SignOptions);

      return token;
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Failed to generate token',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Validate a JWT token and return decoded payload
   */
  async validateToken(token: string): Promise<TokenPayload | null> {
    try {
      const decoded = jwt.verify(token, this.jwtConfig.secret, {
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
      }) as TokenPayload;

      // Verify user still exists and is active
      const user = await this.getUserById(decoded.userId);
      if (!user || user.status !== 'active') {
        return null;
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new CollaborationError(
          CollaborationErrorCode.INVALID_TOKEN,
          'Token has expired'
        );
      }
      if (error instanceof jwt.JsonWebTokenError) {
        // Return null for invalid tokens instead of throwing
        return null;
      }
      return null;
    }
  }

  /**
   * Authenticate user with username and password
   */
  async authenticateUser(username: string, password: string): Promise<User | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM users WHERE username = $1 AND status = $2',
        [username, 'active']
      );

      if (result.rows.length === 0) {
        return null;
      }

      const user = this.mapDbUserToUser(result.rows[0]);

      // Verify password
      const isValid = await this.verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return null;
      }

      // Update last login
      await this.updateLastLogin(user.id);

      return user;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        'Failed to authenticate user',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Check if user has permission for a specific action
   */
  async hasPermission(
    userId: string,
    action: string,
    resourceId?: string
  ): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      if (!user || user.status !== 'active') {
        return false;
      }

      // Admin has all permissions
      if (user.role === 'admin') {
        return true;
      }

      // Define permission matrix
      const permissions: Record<string, string[]> = {
        'session:create': ['admin', 'operator'],
        'session:join': ['admin', 'operator', 'analyst', 'viewer'],
        'session:end': ['admin', 'operator'],
        'comment:add': ['admin', 'operator', 'analyst'],
        'comment:edit': ['admin', 'operator', 'analyst'],
        'comment:delete': ['admin', 'operator'],
        'user:view': ['admin', 'operator', 'analyst', 'viewer'],
        'user:manage': ['admin'],
      };

      const allowedRoles = permissions[action];
      if (!allowedRoles) {
        return false;
      }

      // Check if user's role is allowed
      return allowedRoles.includes(user.role);
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Refresh an existing token
   */
  async refreshToken(oldToken: string): Promise<string> {
    try {
      // Validate the old token (without throwing on expiration)
      let decoded: TokenPayload;
      try {
        decoded = jwt.verify(oldToken, this.jwtConfig.secret, {
          issuer: this.jwtConfig.issuer,
          audience: this.jwtConfig.audience,
          ignoreExpiration: true,
        }) as TokenPayload;
      } catch (error) {
        throw new CollaborationError(
          CollaborationErrorCode.INVALID_TOKEN,
          'Invalid token for refresh'
        );
      }

      // Generate new token with the same userId and role
      return await this.generateToken(decoded.userId, decoded.role);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.INTERNAL_ERROR,
        'Failed to refresh token',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Get user by ID
   */
  private async getUserById(userId: string): Promise<User | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbUserToUser(result.rows[0]);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        'Failed to get user',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Verify password against hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Simple comparison for demo - in production use bcrypt
      // Example: bcrypt.compare(password, hash, (err, result) => { ... })
      
      // For now, simple hash comparison (should use bcrypt in production)
      const hashedInput = crypto.createHash('sha256').update(password).digest('hex');
      resolve(hashedInput === hash || password === hash); // Allow plain text for dev
    });
  }

  /**
   * Update user's last login timestamp
   */
  private async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.pool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [userId]
      );
    } catch (error) {
      // Log but don't fail authentication if update fails
      console.error('Failed to update last login:', error);
    }
  }

  /**
   * Map database row to User object
   */
  private mapDbUserToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      fullName: row.full_name,
      role: row.role,
      status: row.status,
      lastLogin: row.last_login ? new Date(row.last_login) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Create a new user (for registration)
   */
  async createUser(
    username: string,
    email: string,
    password: string,
    fullName?: string,
    role: User['role'] = 'analyst'
  ): Promise<User> {
    try {
      // Hash password (in production, use bcrypt)
      const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

      const result = await this.pool.query(
        `INSERT INTO users (username, email, password_hash, full_name, role, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING *`,
        [username, email, passwordHash, fullName, role]
      );

      return this.mapDbUserToUser(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') { // Unique violation
        throw new CollaborationError(
          CollaborationErrorCode.AUTHENTICATION_FAILED,
          'Username or email already exists'
        );
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        'Failed to create user',
        { error: error.message }
      );
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Factory function to create AuthService instance
 */
export function createAuthService(
  dbConfig: pg.PoolConfig,
  jwtConfig: JWTConfig
): AuthService {
  return new AuthService(dbConfig, jwtConfig);
}

/**
 * Singleton instance (optional)
 */
let authServiceInstance: AuthService | null = null;

export function getAuthService(
  dbConfig?: pg.PoolConfig,
  jwtConfig?: JWTConfig
): AuthService {
  if (!authServiceInstance) {
    if (!dbConfig || !jwtConfig) {
      throw new Error('AuthService not initialized. Provide dbConfig and jwtConfig.');
    }
    authServiceInstance = new AuthService(dbConfig, jwtConfig);
  }
  return authServiceInstance;
}

export function resetAuthService(): void {
  authServiceInstance = null;
}

export default AuthService;