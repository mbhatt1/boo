/**
 * Unified Execution Service Interface
 * 
 * Provides a unified interface for all execution modes (Python CLI, Docker single-container, 
 * Docker full-stack) following modern CLI application patterns.
 * 
 * Key Design Principles:
 * - Configuration-driven execution (no runtime mode detection)
 * - Consistent interface across all execution types
 * - Pre-execution validation guarantees
 * - Unified event handling and lifecycle management
 */

import { EventEmitter } from 'events';
import { Config } from '../contexts/ConfigContext.js';
import { AssessmentParams } from '../types/Assessment.js';

/**
 * Execution modes available in the system
 */
export enum ExecutionMode {
  /** Direct Python execution in virtual environment */
  PYTHON_CLI = 'python-cli',
  /** Single Docker container execution */
  DOCKER_SINGLE = 'docker-single', 
  /** Full Docker stack with observability services */
  DOCKER_STACK = 'docker-stack'
}

/**
 * Result of execution environment validation
 */
export interface ValidationResult {
  /** Whether the execution environment is valid and ready */
  valid: boolean;
  /** Human-readable error message if validation failed */
  error?: string;
  /** Specific issues found during validation */
  issues: ValidationIssue[];
  /** Warnings that don't prevent execution but should be noted */
  warnings: string[];
}

/**
 * Specific validation issue
 */
export interface ValidationIssue {
  /** Type of validation that failed */
  type: 'python' | 'docker' | 'credentials' | 'network' | 'filesystem' | 'config';
  /** Severity of the issue */
  severity: 'error' | 'warning';
  /** Human-readable description */
  message: string;
  /** Suggested resolution if available */
  suggestion?: string;
}

/**
 * Handle for an ongoing execution
 */
export interface ExecutionHandle {
  /** Unique identifier for this execution */
  id: string;
  /** Process ID if available */
  pid?: number;
  /** Promise that resolves when execution completes */
  result: Promise<ExecutionResult>;
  /** Stop the execution */
  stop(): Promise<void>;
  /** Check if execution is still active */
  isActive(): boolean;
}

/**
 * Result of execution
 */
export interface ExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Exit code if available */
  exitCode?: number;
  /** Error message if execution failed */
  error?: string;
  /** Duration of execution in milliseconds */
  durationMs: number;
  /** Number of steps executed */
  stepsExecuted?: number;
  /** Findings or evidence count */
  findingsCount?: number;
}

/**
 * Execution service capabilities
 */
export interface ExecutionCapabilities {
  /** Whether this service can execute assessments */
  canExecute: boolean;
  /** Whether this service supports real-time streaming */
  supportsStreaming: boolean;
  /** Whether this service supports parallel execution */
  supportsParallel: boolean;
  /** Whether this service requires Docker */
  requiresDocker: boolean;
  /** Maximum concurrent executions supported (0 = unlimited) */
  maxConcurrent: number;
  /** Optional list of requirements for this execution service */
  requirements?: string[];
}

/**
 * Unified Execution Service Interface
 *
 * All execution services must implement this interface AND extend EventEmitter.
 *
 * Required EventEmitter Methods:
 * - on(event: string, listener: Function): this
 * - emit(event: string, ...args: any[]): boolean
 * - removeListener(event: string, listener: Function): this
 * - off(event: string, listener: Function): this
 * - removeAllListeners(event?: string): this
 */
export interface ExecutionService {
  // EventEmitter methods (implementations must extend EventEmitter)
  on(event: string, listener: Function): this;
  emit(event: string, ...args: any[]): boolean;
  removeListener(event: string, listener: Function): this;
  off(event: string, listener: Function): this;
  removeAllListeners(event?: string): this;
  
  /**
   * Get the execution mode this service handles
   */
  getMode(): ExecutionMode;

  /**
   * Get service capabilities
   */
  getCapabilities(): ExecutionCapabilities;

  /**
   * Validate that this execution environment is ready
   * This must be called before execute() and should be fast (<1s)
   * 
   * @param config - User configuration
   * @returns Validation result with any issues found
   */
  validate(config: Config): Promise<ValidationResult>;

  /**
   * Execute an assessment using this service
   * validate() should be called first to ensure environment is ready
   * 
   * @param params - Assessment parameters
   * @param config - User configuration
   * @returns Execution handle for managing the running assessment
   */
  execute(params: AssessmentParams, config: Config): Promise<ExecutionHandle>;

  /**
   * Check if this service can handle the given configuration
   * This is a quick availability check, not full validation
   * 
   * @param config - User configuration
   * @returns Whether this service supports the configuration
   */
  isSupported(config: Config): Promise<boolean>;

  /**
   * Setup the execution environment if needed
   * Only called when validation indicates setup is required
   * 
   * @param config - User configuration
   * @param onProgress - Progress callback
   */
  setup?(config: Config, onProgress?: (message: string) => void): Promise<void>;

  /**
   * Cleanup resources and stop any active executions
   */
  cleanup(): void;

  /**
   * Get current status of the service
   */
  isActive(): boolean;
}

/**
 * Events emitted by ExecutionService implementations
 */
export interface ExecutionServiceEvents {
  /** Execution has started */
  'started': (handle: ExecutionHandle) => void;
  /** Structured event from the execution (same format for all services) */
  'event': (event: any) => void;
  /** Execution completed successfully */
  'complete': (result: ExecutionResult) => void;
  /** Execution stopped by user */
  'stopped': () => void;  
  /** Execution failed with error */
  'error': (error: Error) => void;
  /** Service setup progress */
  'progress': (message: string) => void;
}

/**
 * Configuration for execution service selection
 */
export interface ExecutionConfig {
  /** Preferred execution mode (user choice) */
  preferredMode?: ExecutionMode;
  /** Fallback modes to try if preferred fails validation */
  fallbackModes: ExecutionMode[];
  /** Whether to require user confirmation for fallback modes */
  requireConfirmationForFallback: boolean;
  /** Maximum time to wait for validation (ms) */
  validationTimeoutMs: number;
}

/**
 * Default execution configuration
 */
export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  preferredMode: undefined, // Will be set based on user's deployment mode selection
  fallbackModes: [], // No fallbacks - enforce user's mode choice
  requireConfirmationForFallback: true,
  validationTimeoutMs: 5000  // Reduced from 30000 to 5000 (5s is adequate for validation)
};

/**
 * Basic ExecutionService implementation for testing
 */
export class ExecutionService extends EventEmitter {
  protected active = false;
  protected executing = false;
  protected disposed = false;
  protected maxRetries: number;
  protected currentExecution: Promise<any> | null = null;
  protected cancelled = false;
  protected cancelReject: ((reason: Error) => void) | null = null;

  constructor(options?: { maxRetries?: number }) {
    super();
    this.maxRetries = options?.maxRetries ?? 0;
  }

  execute(params: any, _config?: any): Promise<any> {
    // Synchronous validation - throws immediately
    if (!params) {
      throw new Error('Parameters are required');
    }
    if (this.disposed) {
      throw new Error('Service is disposed');
    }
    
    // Start async execution
    return this.executeAsync(params);
  }

  private async executeAsync(params: any): Promise<any> {
    this.active = true;
    this.executing = true;
    this.cancelled = false;
    this.cancelReject = null;
    this.emitStateChange('idle');
    this.emitStateChange('executing');
    
    try {
      // Create a cancellation promise
      const cancellationPromise = new Promise<never>((_, reject) => {
        this.cancelReject = reject;
      });
      
      // Race between execution and cancellation
      this.currentExecution = this.executeWithRetry(params);
      const result = await Promise.race([
        this.currentExecution,
        cancellationPromise
      ]);
      
      this.emitStateChange('completed');
      return result;
    } catch (error) {
      this.emitStateChange('failed');
      throw error;
    } finally {
      this.executing = false;
      this.currentExecution = null;
      this.cancelReject = null;
    }
  }

  private async executeWithRetry(params: any): Promise<any> {
    let attempts = 0;
    let lastError: Error | undefined;
    
    while (attempts <= this.maxRetries) {
      // Check cancellation before each attempt
      if (this.cancelled) {
        throw new Error('Cancelled');
      }
      
      try {
        attempts++;
        
        // Add a delay to allow cancellation to trigger
        await new Promise(resolve => setTimeout(resolve, 20));
        
        // Check cancellation again after delay
        if (this.cancelled) {
          throw new Error('Cancelled');
        }
        
        // Call onExecute if provided
        if (params.onExecute) {
          const result = await params.onExecute();
          
          // Call onData callback if provided
          if (params.onData) {
            params.onData();
          }
          
          // Emit progress update
          if (params.onProgress) {
            params.onProgress(100);
          }
          
          return result;
        }
        
        // Default execution
        if (params.onData) {
          params.onData();
        }
        
        if (params.onProgress) {
          params.onProgress(100);
        }
        
        return { success: true };
      } catch (error) {
        lastError = error as Error;
        
        // If we've exhausted retries, throw
        if (attempts > this.maxRetries) {
          throw lastError;
        }
        
        // Check cancellation before retry delay
        if (this.cancelled) {
          throw new Error('Cancelled');
        }
        
        // Exponential backoff before retry
        const delay = Math.pow(2, attempts - 1) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error('Execution failed');
  }

  private emitStateChange(state: string): void {
    this.emit('stateChange', state);
  }

  cancel(): void {
    this.cancelled = true;
    this.executing = false;
    this.active = false;
    
    // Reject the pending execution if there is one
    if (this.cancelReject) {
      this.cancelReject(new Error('Cancelled'));
      this.cancelReject = null;
    }
    
    this.currentExecution = null;
  }

  stop(): void {
    this.active = false;
    this.executing = false;
  }

  isActive(): boolean {
    return this.active;
  }

  get isExecuting(): boolean {
    return this.executing;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    
    this.disposed = true;
    this.active = false;
    this.executing = false;
    this.cleanup();
  }

  onStateChange(callback: (state: string) => void): void {
    this.on('stateChange', callback);
  }

  cleanup(): void {
    this.active = false;
    this.executing = false;
    this.removeAllListeners();
  }
}