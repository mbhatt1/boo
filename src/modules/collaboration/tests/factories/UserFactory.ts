/**
 * User Factory
 * 
 * Generate test user data
 */

import { generateUUID, generateRandomString, generateEmail, generateUsername } from '../setup/test-helpers.js';

export interface UserFactoryOptions {
  id?: string;
  username?: string;
  email?: string;
  password?: string;
  password_hash?: string;
  full_name?: string;
  role?: 'admin' | 'operator' | 'analyst' | 'viewer';
  status?: 'active' | 'inactive' | 'suspended';
  created_at?: Date;
  updated_at?: Date;
  last_login?: Date | null;
}

export class UserFactory {
  private static sequenceCounter = 1;
  
  /**
   * Create a single user with optional overrides
   */
  static create(options: UserFactoryOptions = {}): any {
    const sequence = this.sequenceCounter++;
    
    return {
      id: options.id || generateUUID(),
      username: options.username || generateUsername(),
      email: options.email || generateEmail(),
      password: options.password || `Password${sequence}!`,
      password_hash: options.password_hash || `$2b$10$hash_${sequence}`,
      full_name: options.full_name || `Test User ${sequence}`,
      role: options.role || 'analyst',
      status: options.status || 'active',
      created_at: options.created_at || new Date(),
      updated_at: options.updated_at || new Date(),
      last_login: options.last_login === undefined ? new Date() : options.last_login,
    };
  }
  
  /**
   * Create multiple users
   */
  static createMany(count: number, options: UserFactoryOptions = {}): any[] {
    return Array.from({ length: count }, () => this.create(options));
  }
  
  /**
   * Create an admin user
   */
  static createAdmin(options: UserFactoryOptions = {}): any {
    return this.create({ ...options, role: 'admin' });
  }
  
  /**
   * Create an operator user
   */
  static createOperator(options: UserFactoryOptions = {}): any {
    return this.create({ ...options, role: 'operator' });
  }
  
  /**
   * Create an analyst user
   */
  static createAnalyst(options: UserFactoryOptions = {}): any {
    return this.create({ ...options, role: 'analyst' });
  }
  
  /**
   * Create a viewer user
   */
  static createViewer(options: UserFactoryOptions = {}): any {
    return this.create({ ...options, role: 'viewer' });
  }
  
  /**
   * Create an inactive user
   */
  static createInactive(options: UserFactoryOptions = {}): any {
    return this.create({ ...options, status: 'inactive' });
  }
  
  /**
   * Create a suspended user
   */
  static createSuspended(options: UserFactoryOptions = {}): any {
    return this.create({ ...options, status: 'suspended' });
  }
  
  /**
   * Create a user with no last login
   */
  static createNeverLoggedIn(options: UserFactoryOptions = {}): any {
    return this.create({ ...options, last_login: null });
  }
  
  /**
   * Reset sequence counter
   */
  static reset(): void {
    this.sequenceCounter = 1;
  }
  
  /**
   * Create user attributes for database insertion
   */
  static createAttributes(options: UserFactoryOptions = {}): any {
    const user = this.create(options);
    // Remove password as it's not stored in DB
    delete user.password;
    return user;
  }
}