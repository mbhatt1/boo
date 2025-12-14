/**
 * Authorization Middleware
 * 
 * Role-Based Access Control (RBAC) enforcement with:
 * - Role-based permissions
 * - Resource-level permissions
 * - Operation-level permissions (read/write/delete)
 * - Permission caching for performance
 * - Permission inheritance
 * - Audit all authorization decisions
 * - Deny-by-default policy
 * 
 * Security: Principle of Least Privilege (PoLP)
 */

import { CollaborationError, CollaborationErrorCode, User } from '../types/index.js';
import type { AuditLogger } from './AuditLogger.js';

/**
 * Permission action types
 */
export enum PermissionAction {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  CREATE = 'create',
  EXECUTE = 'execute',
  ADMIN = 'admin',
}

/**
 * Resource types
 */
export enum ResourceType {
  SESSION = 'session',
  COMMENT = 'comment',
  USER = 'user',
  ACTIVITY = 'activity',
  NOTIFICATION = 'notification',
  SETTING = 'settings',
}

/**
 * Permission definition
 */
export interface Permission {
  resource: ResourceType;
  action: PermissionAction;
  conditions?: PermissionCondition[];
}

/**
 * Permission condition (for dynamic permissions)
 */
export interface PermissionCondition {
  field: string;
  operator: 'equals' | 'notEquals' | 'in' | 'notIn' | 'contains' | 'custom';
  value: any;
  customCheck?: (context: AuthorizationContext) => boolean;
}

/**
 * Authorization context
 */
export interface AuthorizationContext {
  user: User;
  resource?: {
    type: ResourceType;
    id: string;
    ownerId?: string;
    data?: any;
  };
  action: PermissionAction;
  metadata?: Record<string, any>;
}

/**
 * Authorization result
 */
export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
  permission?: Permission;
}

/**
 * Role permissions configuration
 */
export interface RolePermissions {
  role: User['role'];
  permissions: Permission[];
  inherits?: User['role'][];
}

/**
 * Authorization configuration
 */
export interface AuthorizationConfig {
  rolePermissions: RolePermissions[];
  enableCaching: boolean;
  cacheTTL: number; // milliseconds
  enableAuditLogging: boolean;
  denyByDefault: boolean;
}

/**
 * Default role permissions
 */
const DEFAULT_ROLE_PERMISSIONS: RolePermissions[] = [
  // Admin - full access
  {
    role: 'admin',
    permissions: [
      { resource: ResourceType.SESSION, action: PermissionAction.ADMIN },
      { resource: ResourceType.COMMENT, action: PermissionAction.ADMIN },
      { resource: ResourceType.USER, action: PermissionAction.ADMIN },
      { resource: ResourceType.ACTIVITY, action: PermissionAction.ADMIN },
      { resource: ResourceType.NOTIFICATION, action: PermissionAction.ADMIN },
      { resource: ResourceType.SETTING, action: PermissionAction.ADMIN },
    ],
  },
  
  // Operator - can manage sessions and comments
  {
    role: 'operator',
    permissions: [
      { resource: ResourceType.SESSION, action: PermissionAction.CREATE },
      { resource: ResourceType.SESSION, action: PermissionAction.READ },
      { resource: ResourceType.SESSION, action: PermissionAction.WRITE },
      { resource: ResourceType.SESSION, action: PermissionAction.DELETE },
      { resource: ResourceType.COMMENT, action: PermissionAction.CREATE },
      { resource: ResourceType.COMMENT, action: PermissionAction.READ },
      { resource: ResourceType.COMMENT, action: PermissionAction.WRITE },
      { resource: ResourceType.COMMENT, action: PermissionAction.DELETE },
      { resource: ResourceType.ACTIVITY, action: PermissionAction.READ },
      { resource: ResourceType.NOTIFICATION, action: PermissionAction.READ },
      { resource: ResourceType.USER, action: PermissionAction.READ },
    ],
  },
  
  // Analyst - can view and comment
  {
    role: 'analyst',
    permissions: [
      { resource: ResourceType.SESSION, action: PermissionAction.READ },
      { resource: ResourceType.COMMENT, action: PermissionAction.CREATE },
      { resource: ResourceType.COMMENT, action: PermissionAction.READ },
      {
        resource: ResourceType.COMMENT,
        action: PermissionAction.WRITE,
        conditions: [{ field: 'authorId', operator: 'equals', value: 'userId' }],
      },
      {
        resource: ResourceType.COMMENT,
        action: PermissionAction.DELETE,
        conditions: [{ field: 'authorId', operator: 'equals', value: 'userId' }],
      },
      { resource: ResourceType.ACTIVITY, action: PermissionAction.READ },
      { resource: ResourceType.NOTIFICATION, action: PermissionAction.READ },
    ],
  },
  
  // Viewer - read-only access
  {
    role: 'viewer',
    permissions: [
      { resource: ResourceType.SESSION, action: PermissionAction.READ },
      { resource: ResourceType.COMMENT, action: PermissionAction.READ },
      { resource: ResourceType.ACTIVITY, action: PermissionAction.READ },
    ],
  },
];

/**
 * Authorization Middleware
 */
export class AuthorizationMiddleware {
  private config: AuthorizationConfig;
  private permissionCache: Map<string, { result: AuthorizationResult; expiry: number }> = new Map();
  private auditLogger?: AuditLogger;

  constructor(
    config: Partial<AuthorizationConfig> = {},
    auditLogger?: AuditLogger
  ) {
    this.config = {
      rolePermissions: DEFAULT_ROLE_PERMISSIONS,
      enableCaching: true,
      cacheTTL: 60000, // 1 minute
      enableAuditLogging: true,
      denyByDefault: true,
      ...config,
    };
    
    this.auditLogger = auditLogger;
    
    // Start cache cleanup
    if (this.config.enableCaching) {
      this.startCacheCleanup();
    }
  }

  /**
   * Check if user has permission
   */
  async authorize(context: AuthorizationContext): Promise<AuthorizationResult> {
    // Check cache
    if (this.config.enableCaching) {
      const cached = this.getCachedResult(context);
      if (cached) {
        return cached;
      }
    }
    
    // Perform authorization
    const result = this.performAuthorization(context);
    
    // Audit log
    if (this.config.enableAuditLogging && this.auditLogger) {
      await this.auditAuthorizationDecision(context, result);
    }
    
    // Cache result
    if (this.config.enableCaching) {
      this.cacheResult(context, result);
    }
    
    // Throw error if denied
    if (!result.allowed) {
      throw new CollaborationError(
        CollaborationErrorCode.PERMISSION_DENIED,
        result.reason || 'Permission denied',
        {
          userId: context.user.id,
          resource: context.resource?.type,
          action: context.action,
        }
      );
    }
    
    return result;
  }

  /**
   * Check permission without throwing error
   */
  async checkPermission(context: AuthorizationContext): Promise<boolean> {
    try {
      const result = await this.authorize(context);
      return result.allowed;
    } catch {
      return false;
    }
  }

  /**
   * Require permission (throws if denied)
   */
  async requirePermission(context: AuthorizationContext): Promise<void> {
    await this.authorize(context);
  }

  /**
   * Check if user has role
   */
  hasRole(user: User, role: User['role']): boolean {
    return user.role === role;
  }

  /**
   * Check if user has any of the roles
   */
  hasAnyRole(user: User, roles: User['role'][]): boolean {
    return roles.includes(user.role);
  }

  /**
   * Get all permissions for a role
   */
  getRolePermissions(role: User['role']): Permission[] {
    const roleConfig = this.config.rolePermissions.find(r => r.role === role);
    if (!roleConfig) {
      return [];
    }
    
    // Get direct permissions
    const permissions = [...roleConfig.permissions];
    
    // Add inherited permissions
    if (roleConfig.inherits) {
      for (const inheritedRole of roleConfig.inherits) {
        const inherited = this.getRolePermissions(inheritedRole);
        permissions.push(...inherited);
      }
    }
    
    return permissions;
  }

  /**
   * Clear permission cache
   */
  clearCache(userId?: string): void {
    if (userId) {
      // Clear specific user's cache
      for (const [key] of this.permissionCache) {
        if (key.startsWith(`${userId}:`)) {
          this.permissionCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.permissionCache.clear();
    }
  }

  /**
   * Perform authorization check
   */
  private performAuthorization(context: AuthorizationContext): AuthorizationResult {
    const { user, resource, action } = context;
    
    // Get user permissions
    const permissions = this.getRolePermissions(user.role);
    
    // Check for matching permission
    for (const permission of permissions) {
      // Check if permission matches resource and action
      if (resource && permission.resource !== resource.type) {
        continue;
      }
      
      // Admin action grants all actions
      if (permission.action === PermissionAction.ADMIN) {
        return { allowed: true, permission };
      }
      
      // Check specific action
      if (permission.action !== action) {
        continue;
      }
      
      // Check conditions if any
      if (permission.conditions && permission.conditions.length > 0) {
        const conditionsMet = this.checkConditions(permission.conditions, context);
        if (!conditionsMet) {
          continue;
        }
      }
      
      // Permission granted
      return { allowed: true, permission };
    }
    
    // Deny by default
    return {
      allowed: false,
      reason: `User '${user.username}' (${user.role}) does not have permission to ${action} ${resource?.type || 'resource'}`,
    };
  }

  /**
   * Check permission conditions
   */
  private checkConditions(
    conditions: PermissionCondition[],
    context: AuthorizationContext
  ): boolean {
    for (const condition of conditions) {
      // Custom check
      if (condition.customCheck) {
        if (!condition.customCheck(context)) {
          return false;
        }
        continue;
      }
      
      // Get field value from resource
      let fieldValue: any;
      if (context.resource?.data) {
        fieldValue = context.resource.data[condition.field];
      }
      
      // Handle special field 'userId' - compare with user ID
      let compareValue = condition.value;
      if (compareValue === 'userId') {
        compareValue = context.user.id;
      }
      
      // Operator check
      switch (condition.operator) {
        case 'equals':
          if (fieldValue !== compareValue) return false;
          break;
        case 'notEquals':
          if (fieldValue === compareValue) return false;
          break;
        case 'in':
          if (!Array.isArray(compareValue) || !compareValue.includes(fieldValue)) {
            return false;
          }
          break;
        case 'notIn':
          if (Array.isArray(compareValue) && compareValue.includes(fieldValue)) {
            return false;
          }
          break;
        case 'contains':
          if (typeof fieldValue === 'string' && !fieldValue.includes(compareValue)) {
            return false;
          }
          if (Array.isArray(fieldValue) && !fieldValue.includes(compareValue)) {
            return false;
          }
          break;
      }
    }
    
    return true;
  }

  /**
   * Generate cache key
   */
  private getCacheKey(context: AuthorizationContext): string {
    const parts = [
      context.user.id,
      context.action,
      context.resource?.type || 'none',
      context.resource?.id || 'none',
    ];
    return parts.join(':');
  }

  /**
   * Get cached result
   */
  private getCachedResult(context: AuthorizationContext): AuthorizationResult | null {
    const key = this.getCacheKey(context);
    const cached = this.permissionCache.get(key);
    
    if (!cached) {
      return null;
    }
    
    // Check expiry
    if (Date.now() > cached.expiry) {
      this.permissionCache.delete(key);
      return null;
    }
    
    return cached.result;
  }

  /**
   * Cache result
   */
  private cacheResult(context: AuthorizationContext, result: AuthorizationResult): void {
    const key = this.getCacheKey(context);
    this.permissionCache.set(key, {
      result,
      expiry: Date.now() + this.config.cacheTTL,
    });
  }

  /**
   * Start cache cleanup interval
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, cached] of this.permissionCache.entries()) {
        if (now > cached.expiry) {
          this.permissionCache.delete(key);
        }
      }
    }, this.config.cacheTTL);
  }

  /**
   * Audit authorization decision
   */
  private async auditAuthorizationDecision(
    context: AuthorizationContext,
    result: AuthorizationResult
  ): Promise<void> {
    if (!this.auditLogger) {
      return;
    }
    
    if (result.allowed) {
      // Log granted permission (INFO level)
      await this.auditLogger.log({
        eventType: 'authz.permission.granted' as any,
        severity: 'info' as any,
        userId: context.user.id,
        username: context.user.username,
        resource: context.resource?.type,
        action: context.action,
        result: 'success',
        details: {
          resourceId: context.resource?.id,
          permission: result.permission,
        },
      });
    } else {
      // Log denied permission (WARNING level)
      await this.auditLogger.logAuthzDenial(
        context.user.id,
        context.user.username,
        context.resource?.type || 'unknown',
        context.action,
        result.reason || 'No matching permission found'
      );
    }
  }
}

/**
 * Express/Connect middleware factory
 */
export function createAuthorizationMiddleware(
  getUser: (req: any) => Promise<User | null>,
  auditLogger?: AuditLogger
) {
  const authz = new AuthorizationMiddleware({}, auditLogger);
  
  return (requiredPermission: { resource: ResourceType; action: PermissionAction }) => {
    return async (req: any, res: any, next: any) => {
      try {
        // Get user from request (set by authentication middleware)
        const user = await getUser(req);
        
        if (!user) {
          throw new CollaborationError(
            CollaborationErrorCode.AUTHENTICATION_FAILED,
            'User not authenticated'
          );
        }
        
        // Check permission
        await authz.requirePermission({
          user,
          resource: requiredPermission.resource ? {
            type: requiredPermission.resource,
            id: req.params.id || req.params.resourceId,
          } : undefined,
          action: requiredPermission.action,
        });
        
        next();
      } catch (error) {
        if (error instanceof CollaborationError) {
          res.status(error.code === CollaborationErrorCode.AUTHENTICATION_FAILED ? 401 : 403)
            .json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    };
  };
}

/**
 * Singleton instance
 */
let authorizationMiddlewareInstance: AuthorizationMiddleware | null = null;

export function getAuthorizationMiddleware(
  config?: Partial<AuthorizationConfig>,
  auditLogger?: AuditLogger
): AuthorizationMiddleware {
  if (!authorizationMiddlewareInstance) {
    authorizationMiddlewareInstance = new AuthorizationMiddleware(config, auditLogger);
  }
  return authorizationMiddlewareInstance;
}

export function resetAuthorizationMiddleware(): void {
  authorizationMiddlewareInstance = null;
}

export default AuthorizationMiddleware;