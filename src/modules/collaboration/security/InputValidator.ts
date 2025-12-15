/**
 * Input Validation & Sanitization Service
 * 
 * Provides comprehensive input validation and sanitization to prevent:
 * - XSS attacks
 * - SQL injection
 * - Command injection
 * - Path traversal
 * - DoS via oversized inputs
 * 
 * OWASP Top 10 compliant validation
 */

import { CollaborationError, CollaborationErrorCode } from '../types/index.js';

/**
 * Validation configuration
 */
export interface ValidationConfig {
  maxStringLength: number;
  maxArrayLength: number;
  maxObjectDepth: number;
  maxUrlLength: number;
  allowedProtocols: string[];
  allowedFileExtensions: string[];
}

/**
 * Default validation configuration
 */
const DEFAULT_CONFIG: ValidationConfig = {
  maxStringLength: 10000,
  maxArrayLength: 1000,
  maxObjectDepth: 10,
  maxUrlLength: 2048,
  allowedProtocols: ['http', 'https', 'ws', 'wss'],
  allowedFileExtensions: ['.txt', '.md', '.json', '.csv', '.pdf', '.doc', '.docx'],
};

/**
 * Validation error with field information
 */
export class ValidationError extends CollaborationError {
  constructor(field: string, message: string, details?: any) {
    super(
      CollaborationErrorCode.INVALID_MESSAGE,
      `Validation failed for ${field}: ${message}`,
      { field, ...details }
    );
  }
}

/**
 * Input Validator Service
 */
export class InputValidator {
  private config: ValidationConfig;

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate and sanitize a WebSocket message
   */
  validateMessage(message: any): any {
    if (!message || typeof message !== 'object') {
      throw new ValidationError('message', 'Message must be an object');
    }

    // Check object depth
    this.validateObjectDepth(message, 0);

    // Validate required fields
    if (!message.type || typeof message.type !== 'string') {
      throw new ValidationError('type', 'Message type is required and must be a string');
    }

    // Sanitize message type
    message.type = this.sanitizeString(message.type, 100);

    // Validate message type format (alphanumeric with underscores and colons)
    if (!/^[a-zA-Z0-9_:]+$/.test(message.type)) {
      throw new ValidationError('type', 'Message type contains invalid characters');
    }

    // Validate payload if present
    if (message.payload !== undefined) {
      message.payload = this.sanitizeObject(message.payload);
    }

    return message;
  }

  /**
   * Validate and sanitize a string
   */
  sanitizeString(input: string, maxLength?: number): string {
    if (typeof input !== 'string') {
      throw new ValidationError('string', 'Input must be a string');
    }

    const limit = maxLength || this.config.maxStringLength;
    
    // Check length first before processing
    if (input.length > limit) {
      throw new ValidationError(
        'string',
        `String exceeds maximum length of ${limit}`,
        { length: input.length }
      );
    }

    // Remove null bytes (can cause issues)
    let sanitized = input.replace(/\0/g, '');

    // Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
  }

  /**
   * Sanitize HTML content (XSS prevention)
   */
  sanitizeHtml(input: string): string {
    if (typeof input !== 'string') {
      throw new ValidationError('html', 'HTML input must be a string');
    }

    // Escape HTML special characters
    const htmlEscapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
      '=': '&#x3D;',
    };

    return input.replace(/[&<>"'/=]/g, (char) => htmlEscapeMap[char]);
  }

  /**
   * Validate and sanitize markdown content
   */
  sanitizeMarkdown(input: string): string {
    if (typeof input !== 'string') {
      throw new ValidationError('markdown', 'Markdown input must be a string');
    }

    this.checkStringLength(input, 'markdown');

    // Remove potentially dangerous markdown features
    let sanitized = input;

    // Remove javascript: URLs in links
    sanitized = sanitized.replace(/\[([^\]]+)\]\(javascript:[^\)]*\)/gi, '[$1](about:blank)');

    // Remove data: URLs (except safe image types)
    sanitized = sanitized.replace(
      /\[([^\]]+)\]\(data:(?!image\/(png|jpg|jpeg|gif|svg\+xml))[^\)]*\)/gi,
      '[$1](about:blank)'
    );

    // Sanitize HTML in markdown
    sanitized = this.sanitizeHtml(sanitized);

    return sanitized;
  }

  /**
   * Validate URL
   */
  validateUrl(input: string): boolean {
    if (typeof input !== 'string') {
      throw new ValidationError('url', 'URL must be a string');
    }

    if (input.length > this.config.maxUrlLength) {
      throw new ValidationError(
        'url',
        `URL exceeds maximum length of ${this.config.maxUrlLength}`
      );
    }

    // Basic URL validation
    try {
      const url = new URL(input);
      
      // Check protocol
      const protocol = url.protocol.replace(':', '');
      if (!this.config.allowedProtocols.includes(protocol)) {
        throw new ValidationError('url', `Protocol ${protocol} not allowed`);
      }
    } catch (error) {
      throw new ValidationError('url', 'Invalid URL format');
    }

    // Additional checks for suspicious patterns
    const suspiciousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /file:/i,
      /<script/i,
      /onerror=/i,
      /onclick=/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(input)) {
        throw new ValidationError('url', 'URL contains suspicious patterns');
      }
    }

    return true;
  }

  /**
   * Validate file path (prevent path traversal)
   */
  validateFilePath(input: string): boolean {
    if (typeof input !== 'string') {
      throw new ValidationError('filepath', 'File path must be a string');
    }

    // Check for path traversal attempts
    const pathTraversalPatterns = [
      /\.\./,        // Parent directory
      /\/\//,        // Double slashes
      /\\/,          // Backslashes
      /\0/,          // Null bytes
      /^[\/~]/,      // Absolute paths
    ];

    for (const pattern of pathTraversalPatterns) {
      if (pattern.test(input)) {
        throw new ValidationError('filepath', 'File path contains invalid patterns');
      }
    }

    // Validate file extension if present
    const ext = input.match(/\.[^.]*$/)?.[0];
    if (ext && !this.config.allowedFileExtensions.includes(ext.toLowerCase())) {
      throw new ValidationError(
        'filepath',
        'File extension not allowed',
        { extension: ext }
      );
    }

    return true;
  }

  /**
   * Validate email address
   */
  validateEmail(input: string): boolean {
    if (typeof input !== 'string') {
      throw new ValidationError('email', 'Email must be a string');
    }

    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input)) {
      throw new ValidationError('email', 'Invalid email format');
    }

    // Additional length check
    if (input.length > 255) {
      throw new ValidationError('email', 'Email exceeds maximum length');
    }

    return true;
  }

  /**
   * Validate username
   */
  validateUsername(input: string): boolean {
    if (typeof input !== 'string') {
      throw new ValidationError('username', 'Username must be a string');
    }

    // Length check
    if (input.length < 3 || input.length > 50) {
      throw new ValidationError('username', 'Username must be 3-50 characters');
    }

    // Alphanumeric with underscores and hyphens only
    if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
      throw new ValidationError('username', 'Username contains invalid characters');
    }

    return true;
  }

  /**
   * Validate UUID
   */
  validateUuid(input: string): boolean {
    if (typeof input !== 'string') {
      throw new ValidationError('uuid', 'UUID must be a string');
    }

    // UUID v4 validation regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(input)) {
      throw new ValidationError('uuid', 'Invalid UUID format');
    }

    return true;
  }

  /**
   * Validate integer in range
   */
  validateInteger(input: any, min?: number, max?: number): boolean {
    if (!Number.isInteger(input)) {
      throw new ValidationError('integer', 'Value must be an integer');
    }

    if (min !== undefined && input < min) {
      throw new ValidationError('integer', `Value must be at least ${min}`);
    }

    if (max !== undefined && input > max) {
      throw new ValidationError('integer', `Value must be at most ${max}`);
    }

    return true;
  }

  /**
   * Validate enum value
   */
  validateEnum(input: any, allowedValues: any[]): boolean {
    if (!allowedValues.includes(input)) {
      throw new ValidationError(
        'enum',
        'Value not in allowed set',
        { allowed: allowedValues }
      );
    }

    return true;
  }

  /**
   * Validate array
   */
  validateArray(input: any, itemValidator?: (item: any) => boolean): boolean {
    if (!Array.isArray(input)) {
      throw new ValidationError('array', 'Value must be an array');
    }

    if (input.length > this.config.maxArrayLength) {
      throw new ValidationError(
        'array',
        `Array exceeds maximum length of ${this.config.maxArrayLength}`
      );
    }

    if (itemValidator) {
      for (let i = 0; i < input.length; i++) {
        try {
          itemValidator(input[i]);
        } catch (error) {
          throw new ValidationError(
            `array[${i}]`,
            'Invalid array item',
            { error: (error as Error).message }
          );
        }
      }
    }

    return true;
  }

  /**
   * Sanitize object recursively
   */
  private sanitizeObject(obj: any, depth: number = 0): any {
    this.validateObjectDepth(obj, depth);

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      if (obj.length > this.config.maxArrayLength) {
        throw new ValidationError('array', 'Array too large');
      }
      return obj.map((item) => this.sanitizeObject(item, depth + 1));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key, 255);
        sanitized[sanitizedKey] = this.sanitizeObject(value, depth + 1);
      }
      return sanitized;
    }

    // Unknown type - reject
    throw new ValidationError('object', 'Unsupported data type');
  }

  /**
   * Check object depth to prevent DoS
   */
  private validateObjectDepth(obj: any, depth: number): void {
    if (depth > this.config.maxObjectDepth) {
      throw new ValidationError(
        'object',
        `Object nesting exceeds maximum depth of ${this.config.maxObjectDepth}`
      );
    }

    if (typeof obj === 'object' && obj !== null) {
      for (const value of Object.values(obj)) {
        if (typeof value === 'object' && value !== null) {
          this.validateObjectDepth(value, depth + 1);
        }
      }
    }
  }

  /**
   * Check string length
   */
  private checkStringLength(input: string, fieldName: string): void {
    if (input.length > this.config.maxStringLength) {
      throw new ValidationError(
        fieldName,
        `String exceeds maximum length of ${this.config.maxStringLength}`
      );
    }
  }

  /**
   * Prevent SQL injection in identifiers
   */
  validateSqlIdentifier(input: string): boolean {
    if (typeof input !== 'string') {
      throw new ValidationError('sql_identifier', 'SQL identifier must be a string');
    }

    // Only allow alphanumeric and underscores
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input)) {
      throw new ValidationError('sql_identifier', 'Invalid SQL identifier format');
    }

    // Check length
    if (input.length > 63) { // PostgreSQL limit
      throw new ValidationError('sql_identifier', 'SQL identifier too long');
    }

    // Reserved keywords check (basic list)
    const reservedKeywords = [
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
      'TABLE', 'DATABASE', 'INDEX', 'WHERE', 'FROM', 'JOIN', 'UNION',
    ];

    if (reservedKeywords.includes(input.toUpperCase())) {
      throw new ValidationError('sql_identifier', 'SQL identifier is a reserved keyword');
    }

    return true;
  }

  /**
   * Validate command (prevent command injection)
   */
  validateCommand(input: string): boolean {
    if (typeof input !== 'string') {
      throw new ValidationError('command', 'Command must be a string');
    }

    // Deny list of dangerous characters/patterns
    const dangerousPatterns = [
      /[;&|`$()]/,          // Shell metacharacters
      /\n|\r/,              // Newlines
      /<|>/,                // Redirects
      /\.\./,               // Path traversal
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(input)) {
        throw new ValidationError('command', 'Command contains dangerous characters');
      }
    }

    return true;
  }
}

/**
 * Singleton instance
 */
let validatorInstance: InputValidator | null = null;

export function getInputValidator(config?: Partial<ValidationConfig>): InputValidator {
  if (!validatorInstance) {
    validatorInstance = new InputValidator(config);
  }
  return validatorInstance;
}

export function resetInputValidator(): void {
  validatorInstance = null;
}

export default InputValidator;