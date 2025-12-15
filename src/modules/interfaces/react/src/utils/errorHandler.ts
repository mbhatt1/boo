/**
 * Centralized error handling utilities
 */

import { logger } from './logger.js';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ErrorCategory {
  NETWORK = 'network',
  CONFIGURATION = 'configuration',
  EXECUTION = 'execution',
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  RESOURCE = 'resource',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

export interface ErrorContext {
  operation?: string;
  target?: string;
  tool?: string;
  step?: number;
  module?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export class BooAgentError extends Error {
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;
  public readonly context?: ErrorContext;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;

  constructor(
    message: string,
    options?: {
      severity?: ErrorSeverity;
      category?: ErrorCategory;
      context?: ErrorContext;
      recoverable?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'BooAgentError';
    this.severity = options?.severity || ErrorSeverity.MEDIUM;
    this.category = options?.category || ErrorCategory.UNKNOWN;
    this.context = options?.context;
    this.timestamp = new Date();
    this.recoverable = options?.recoverable ?? true;
    
    if (options?.cause) {
      this.cause = options.cause;
    }

    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BooAgentError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      severity: this.severity,
      category: this.category,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      recoverable: this.recoverable,
      stack: this.stack,
      cause: this.cause,
    };
  }
}

/**
 * Global error handler for uncaught errors
 */
export const handleError = (
  error: Error | BooAgentError,
  context?: ErrorContext
): void => {
  // Determine severity based on error type
  const severity = error instanceof BooAgentError 
    ? error.severity 
    : ErrorSeverity.HIGH;

  // Log error with appropriate level
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      logger.error('Critical error occurred', error, context as Record<string, any>);
      break;
    case ErrorSeverity.HIGH:
      logger.error('Error occurred', error, context as Record<string, any>);
      break;
    case ErrorSeverity.MEDIUM:
      logger.warn('Warning: Error occurred', context as Record<string, any>);
      break;
    case ErrorSeverity.LOW:
      logger.info('Minor error occurred', context as Record<string, any>);
      break;
  }

  // Report to monitoring service if configured
  if (process.env.ENABLE_ERROR_REPORTING === 'true') {
    reportErrorToMonitoring(error, context);
  }
  
  // Store context in error if it's a BooAgentError
  if (error instanceof BooAgentError && context && !error.context) {
    (error as any).context = context;
  }
};

/**
 * Report error to monitoring service (placeholder)
 */
const reportErrorToMonitoring = (
  error: Error | BooAgentError,
  context?: ErrorContext
): void => {
  // This would integrate with services like Sentry, Datadog, etc.
  // For now, just log that we would report it
  if (process.env.NODE_ENV === 'production') {
    logger.debug('Would report error to monitoring service', {
      message: error.message,
      context,
    });
  }
};

/**
 * Wrap async functions with error handling
 */
export const withErrorHandling = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: ErrorContext
): T => {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error as Error, context);
      throw error;
    }
  }) as T;
};

/**
 * Create error with context
 */
export const createError = (
  message: string,
  category: ErrorCategory,
  context?: ErrorContext
): BooAgentError => {
  return new BooAgentError(message, {
    category,
    context,
    severity: ErrorSeverity.MEDIUM,
  });
};

/**
 * Common error factories
 */
export const Errors = {
  network: (message: string, context?: ErrorContext) =>
    new BooAgentError(message, {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      context,
      recoverable: true,
    }),

  configuration: (message: string, context?: ErrorContext) =>
    new BooAgentError(message, {
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.HIGH,
      context,
      recoverable: false,
    }),

  timeout: (message: string, context?: ErrorContext) =>
    new BooAgentError(message, {
      category: ErrorCategory.TIMEOUT,
      severity: ErrorSeverity.MEDIUM,
      context,
      recoverable: true,
    }),

  validation: (message: string, context?: ErrorContext) =>
    new BooAgentError(message, {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      context,
      recoverable: false,
    }),

  permission: (message: string, context?: ErrorContext) =>
    new BooAgentError(message, {
      category: ErrorCategory.PERMISSION,
      severity: ErrorSeverity.CRITICAL,
      context,
      recoverable: false,
    }),

  execution: (message: string, context?: ErrorContext) =>
    new BooAgentError(message, {
      category: ErrorCategory.EXECUTION,
      severity: ErrorSeverity.HIGH,
      context,
      recoverable: true,
    }),
};

/**
 * ErrorHandler class for processing and handling errors
 */
export class ErrorHandler {
  /**
   * Process an error and extract relevant information
   */
  static process(error: any): {
    message: string;
    type: string;
    stack?: string;
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    context?: ErrorContext;
  } {
    // Handle null/undefined
    if (error == null) {
      return {
        message: error === null ? 'Null error' : 'Undefined error',
        type: 'Error',
      };
    }

    // Handle non-Error objects
    if (!(error instanceof Error)) {
      return {
        message: typeof error === 'object' ? JSON.stringify(error) : String(error),
        type: 'Error',
      };
    }

    const result: any = {
      message: error.message,
      type: error.name || 'Error',
      stack: error.stack,
    };

    if (error instanceof BooAgentError) {
      result.severity = error.severity;
      result.category = error.category;
      result.context = error.context;
    }

    return result;
  }

  /**
   * Classify an error by type
   */
  static classify(error: Error): string {
    if (!error) return 'unknown';
    
    const errorName = error.name.toLowerCase();
    const errorMessage = error.message.toLowerCase();

    if (errorName.includes('network') || errorMessage.includes('network')) {
      return 'network';
    }
    if (errorName.includes('validation') || errorMessage.includes('validation')) {
      return 'validation';
    }
    if (errorName.includes('timeout') || errorMessage.includes('timeout')) {
      return 'timeout';
    }
    if (errorName.includes('permission') || errorMessage.includes('permission')) {
      return 'permission';
    }
    
    return 'unknown';
  }

  /**
   * Log an error with optional context
   */
  static log(error: Error | BooAgentError, context?: ErrorContext): void {
    const timestamp = new Date().toISOString();
    const processed = ErrorHandler.process(error);
    
    console.error(`[${timestamp}] ${processed.type}: ${processed.message}`, {
      ...processed,
      context,
    });
  }

  /**
   * Get recovery suggestion for an error
   */
  static getRecoverySuggestion(error: Error): string {
    const type = ErrorHandler.classify(error);
    
    switch (type) {
      case 'network':
        return 'Check your network connection and try again.';
      case 'validation':
        return 'Please check your input and try again.';
      case 'timeout':
        return 'The operation timed out. Please try again later.';
      case 'permission':
        return 'You do not have permission to perform this action.';
      default:
        return 'An error occurred. Please try again or contact support.';
    }
  }

  /**
   * Format error for display
   */
  static format(
    error: Error,
    options?: { maxLength?: number; includeType?: boolean }
  ): string {
    const maxLength = options?.maxLength;
    const includeType = options?.includeType;
    
    let message = error.message;
    
    if (maxLength && message.length > maxLength) {
      message = message.substring(0, maxLength - 3) + '...';
    }
    
    if (includeType) {
      return `[${error.name}] ${message}`;
    }
    
    return message;
  }

  /**
   * Sanitize error by removing sensitive information
   */
  static sanitize(error: Error): Error {
    const sanitized = new Error(error.message);
    sanitized.name = error.name;
    sanitized.stack = error.stack;
    
    // Remove sensitive patterns
    const patterns = [
      /password[:\s]+[^\s]+/gi,
      /api[_\s]?key[:\s]+[^\s]+/gi,
      /token[:\s]+[^\s]+/gi,
      /secret[:\s]+[^\s]+/gi,
    ];
    
    for (const pattern of patterns) {
      sanitized.message = sanitized.message.replace(pattern, '[REDACTED]');
    }
    
    return sanitized;
  }

  /**
   * Handle an error (wrapper around handleError function)
   */
  static handle(error: Error | BooAgentError, context?: ErrorContext): void {
    handleError(error, context);
  }

  /**
   * Create a new BooAgentError
   */
  static create(
    message: string,
    category: ErrorCategory,
    context?: ErrorContext
  ): BooAgentError {
    return createError(message, category, context);
  }
}