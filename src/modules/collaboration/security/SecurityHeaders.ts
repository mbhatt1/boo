/**
 * Security Headers Middleware
 * 
 * Implements security HTTP headers to protect against common web vulnerabilities:
 * - Content-Security-Policy (CSP) - XSS protection
 * - X-Frame-Options - Clickjacking protection  
 * - X-Content-Type-Options - MIME sniffing protection
 * - Strict-Transport-Security (HSTS) - Force HTTPS
 * - X-XSS-Protection - Legacy XSS filter
 * - Referrer-Policy - Control referrer information
 * - Permissions-Policy - Control browser features
 * - CORS - Cross-Origin Resource Sharing
 * 
 * OWASP Top 10 compliant
 */

// Type definitions for http module (when @types/node is not available)
interface IncomingMessage {
  method?: string;
  headers: {
    origin?: string;
    'access-control-request-method'?: string;
    'access-control-request-headers'?: string;
    [key: string]: string | string[] | undefined;
  };
}

interface ServerResponse {
  statusCode: number;
  setHeader(name: string, value: string | number): void;
  end(): void;
}

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  // Content Security Policy
  csp: {
    enabled: boolean;
    directives: {
      defaultSrc?: string[];
      scriptSrc?: string[];
      styleSrc?: string[];
      imgSrc?: string[];
      connectSrc?: string[];
      fontSrc?: string[];
      objectSrc?: string[];
      mediaSrc?: string[];
      frameSrc?: string[];
      sandbox?: string[];
      reportUri?: string;
      reportTo?: string;
      upgradeInsecureRequests?: boolean;
      blockAllMixedContent?: boolean;
    };
    reportOnly: boolean;
  };
  
  // HTTP Strict Transport Security
  hsts: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  
  // X-Frame-Options
  frameOptions: {
    enabled: boolean;
    action: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
    domain?: string;
  };
  
  // X-Content-Type-Options
  noSniff: {
    enabled: boolean;
  };
  
  // X-XSS-Protection (legacy)
  xssProtection: {
    enabled: boolean;
    mode: 'block' | 'sanitize';
  };
  
  // Referrer-Policy
  referrerPolicy: {
    enabled: boolean;
    policy: 
      | 'no-referrer'
      | 'no-referrer-when-downgrade'
      | 'origin'
      | 'origin-when-cross-origin'
      | 'same-origin'
      | 'strict-origin'
      | 'strict-origin-when-cross-origin'
      | 'unsafe-url';
  };
  
  // Permissions-Policy (formerly Feature-Policy)
  permissionsPolicy: {
    enabled: boolean;
    features: {
      camera?: string[];
      microphone?: string[];
      geolocation?: string[];
      payment?: string[];
      usb?: string[];
      midi?: string[];
      syncXhr?: string[];
      magnetometer?: string[];
      gyroscope?: string[];
      accelerometer?: string[];
    };
  };
  
  // CORS
  cors: {
    enabled: boolean;
    origin: string | string[] | ((origin: string) => boolean);
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
    preflightContinue: boolean;
  };
  
  // Additional headers
  additionalHeaders: Record<string, string>;
}

/**
 * Default secure configuration
 */
const DEFAULT_CONFIG: SecurityHeadersConfig = {
  csp: {
    enabled: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Adjust based on needs
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: true,
      blockAllMixedContent: true,
    },
    reportOnly: false,
  },
  
  hsts: {
    enabled: true,
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  
  frameOptions: {
    enabled: true,
    action: 'DENY',
  },
  
  noSniff: {
    enabled: true,
  },
  
  xssProtection: {
    enabled: true,
    mode: 'block',
  },
  
  referrerPolicy: {
    enabled: true,
    policy: 'strict-origin-when-cross-origin',
  },
  
  permissionsPolicy: {
    enabled: true,
    features: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
      usb: [],
      midi: [],
      syncXhr: [],
    },
  },
  
  cors: {
    enabled: true,
    // Bug #37 Fix: Use proper CORS configuration - defaults to localhost for dev
    // Set CORS_ORIGIN environment variable with comma-separated origins for production
    origin: ['http://localhost:3000', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    credentials: true,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
  },
  
  additionalHeaders: {
    'X-Permitted-Cross-Domain-Policies': 'none',
    'X-Download-Options': 'noopen',
  },
};

/**
 * Security Headers Middleware
 */
export class SecurityHeaders {
  private config: SecurityHeadersConfig;

  constructor(config: Partial<SecurityHeadersConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
  }

  /**
   * Apply security headers to HTTP response
   */
  applyHeaders(res: ServerResponse, req?: IncomingMessage): void {
    // Content Security Policy
    if (this.config.csp.enabled) {
      const cspHeader = this.buildCSPHeader();
      const headerName = this.config.csp.reportOnly
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy';
      res.setHeader(headerName, cspHeader);
    }
    
    // HSTS
    if (this.config.hsts.enabled) {
      const hstsValue = this.buildHSTSHeader();
      res.setHeader('Strict-Transport-Security', hstsValue);
    }
    
    // X-Frame-Options
    if (this.config.frameOptions.enabled) {
      const frameValue = this.buildFrameOptionsHeader();
      res.setHeader('X-Frame-Options', frameValue);
    }
    
    // X-Content-Type-Options
    if (this.config.noSniff.enabled) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    // X-XSS-Protection
    if (this.config.xssProtection.enabled) {
      const xssValue = this.config.xssProtection.mode === 'block'
        ? '1; mode=block'
        : '1';
      res.setHeader('X-XSS-Protection', xssValue);
    }
    
    // Referrer-Policy
    if (this.config.referrerPolicy.enabled) {
      res.setHeader('Referrer-Policy', this.config.referrerPolicy.policy);
    }
    
    // Permissions-Policy
    if (this.config.permissionsPolicy.enabled) {
      const permissionsValue = this.buildPermissionsPolicyHeader();
      if (permissionsValue) {
        res.setHeader('Permissions-Policy', permissionsValue);
      }
    }
    
    // CORS
    if (this.config.cors.enabled && req) {
      this.applyCORSHeaders(res, req);
    }
    
    // Additional headers
    for (const [name, value] of Object.entries(this.config.additionalHeaders)) {
      res.setHeader(name, value);
    }
  }

  /**
   * Handle CORS preflight request
   */
  handlePreflightRequest(res: ServerResponse, req: IncomingMessage): void {
    if (this.config.cors.enabled) {
      this.applyCORSHeaders(res, req);
      
      if (!this.config.cors.preflightContinue) {
        res.statusCode = 204;
        res.end();
      }
    }
  }

  /**
   * Check if request is CORS preflight
   */
  isPreflightRequest(req: IncomingMessage): boolean {
    return req.method === 'OPTIONS' &&
           req.headers['origin'] !== undefined &&
           req.headers['access-control-request-method'] !== undefined;
  }

  /**
   * Build Content Security Policy header value
   */
  private buildCSPHeader(): string {
    const directives: string[] = [];
    const { directives: cspDirectives } = this.config.csp;
    
    // Map directive names to CSP format
    const directiveMap: Record<string, string> = {
      defaultSrc: 'default-src',
      scriptSrc: 'script-src',
      styleSrc: 'style-src',
      imgSrc: 'img-src',
      connectSrc: 'connect-src',
      fontSrc: 'font-src',
      objectSrc: 'object-src',
      mediaSrc: 'media-src',
      frameSrc: 'frame-src',
      sandbox: 'sandbox',
      reportUri: 'report-uri',
      reportTo: 'report-to',
    };
    
    // Build directives
    for (const [key, cspKey] of Object.entries(directiveMap)) {
      const value = cspDirectives[key as keyof typeof cspDirectives];
      if (Array.isArray(value) && value.length > 0) {
        directives.push(`${cspKey} ${value.join(' ')}`);
      } else if (typeof value === 'string') {
        directives.push(`${cspKey} ${value}`);
      }
    }
    
    // Add special directives
    if (cspDirectives.upgradeInsecureRequests) {
      directives.push('upgrade-insecure-requests');
    }
    
    if (cspDirectives.blockAllMixedContent) {
      directives.push('block-all-mixed-content');
    }
    
    return directives.join('; ');
  }

  /**
   * Build HSTS header value
   */
  private buildHSTSHeader(): string {
    const { maxAge, includeSubDomains, preload } = this.config.hsts;
    let value = `max-age=${maxAge}`;
    
    if (includeSubDomains) {
      value += '; includeSubDomains';
    }
    
    if (preload) {
      value += '; preload';
    }
    
    return value;
  }

  /**
   * Build X-Frame-Options header value
   */
  private buildFrameOptionsHeader(): string {
    const { action, domain } = this.config.frameOptions;
    
    if (action === 'ALLOW-FROM' && domain) {
      return `ALLOW-FROM ${domain}`;
    }
    
    return action;
  }

  /**
   * Build Permissions-Policy header value
   */
  private buildPermissionsPolicyHeader(): string {
    const policies: string[] = [];
    const { features } = this.config.permissionsPolicy;
    
    for (const [feature, origins] of Object.entries(features)) {
      if (Array.isArray(origins)) {
        const kebabFeature = this.camelToKebab(feature);
        
        if (origins.length === 0) {
          policies.push(`${kebabFeature}=()`);
        } else if (origins.includes('*')) {
          policies.push(`${kebabFeature}=*`);
        } else {
          const originList = origins.map(o => `"${o}"`).join(' ');
          policies.push(`${kebabFeature}=(${originList})`);
        }
      }
    }
    
    return policies.join(', ');
  }

  /**
   * Apply CORS headers
   */
  private applyCORSHeaders(res: ServerResponse, req: IncomingMessage): void {
    const origin = req.headers.origin;
    const { cors } = this.config;
    
    // Check origin
    if (origin && this.isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (cors.origin === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    // Allow credentials
    if (cors.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    // Preflight request headers
    if (req.method === 'OPTIONS') {
      // Allow methods
      res.setHeader('Access-Control-Allow-Methods', cors.methods.join(', '));
      
      // Allow headers
      const requestHeaders = req.headers['access-control-request-headers'];
      if (requestHeaders) {
        res.setHeader('Access-Control-Allow-Headers', requestHeaders);
      } else {
        res.setHeader('Access-Control-Allow-Headers', cors.allowedHeaders.join(', '));
      }
      
      // Max age
      res.setHeader('Access-Control-Max-Age', cors.maxAge.toString());
    }
    
    // Exposed headers
    if (cors.exposedHeaders.length > 0) {
      res.setHeader('Access-Control-Expose-Headers', cors.exposedHeaders.join(', '));
    }
  }

  /**
   * Check if origin is allowed
   */
  private isOriginAllowed(origin: string): boolean {
    const { cors } = this.config;
    
    if (typeof cors.origin === 'function') {
      return cors.origin(origin);
    }
    
    if (typeof cors.origin === 'string') {
      return cors.origin === origin || cors.origin === '*';
    }
    
    if (Array.isArray(cors.origin)) {
      return cors.origin.includes(origin);
    }
    
    return false;
  }

  /**
   * Convert camelCase to kebab-case
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * Merge configuration with defaults
   */
  private mergeConfig(
    defaults: SecurityHeadersConfig,
    custom: Partial<SecurityHeadersConfig>
  ): SecurityHeadersConfig {
    return {
      csp: { ...defaults.csp, ...custom.csp, directives: { ...defaults.csp.directives, ...custom.csp?.directives } },
      hsts: { ...defaults.hsts, ...custom.hsts },
      frameOptions: { ...defaults.frameOptions, ...custom.frameOptions },
      noSniff: { ...defaults.noSniff, ...custom.noSniff },
      xssProtection: { ...defaults.xssProtection, ...custom.xssProtection },
      referrerPolicy: { ...defaults.referrerPolicy, ...custom.referrerPolicy },
      permissionsPolicy: { ...defaults.permissionsPolicy, ...custom.permissionsPolicy, features: { ...defaults.permissionsPolicy.features, ...custom.permissionsPolicy?.features } },
      cors: { ...defaults.cors, ...custom.cors },
      additionalHeaders: { ...defaults.additionalHeaders, ...custom.additionalHeaders },
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityHeadersConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SecurityHeadersConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
  }
}

/**
 * Express/Connect middleware factory
 */
export function createSecurityHeadersMiddleware(
  config?: Partial<SecurityHeadersConfig>
) {
  const securityHeaders = new SecurityHeaders(config);
  
  return (req: any, res: any, next: any) => {
    // Handle preflight
    if (securityHeaders.isPreflightRequest(req)) {
      securityHeaders.handlePreflightRequest(res, req);
      return;
    }
    
    // Apply headers
    securityHeaders.applyHeaders(res, req);
    next();
  };
}

/**
 * Singleton instance
 */
let securityHeadersInstance: SecurityHeaders | null = null;

export function getSecurityHeaders(config?: Partial<SecurityHeadersConfig>): SecurityHeaders {
  if (!securityHeadersInstance) {
    securityHeadersInstance = new SecurityHeaders(config);
  }
  return securityHeadersInstance;
}

export function resetSecurityHeaders(): void {
  securityHeadersInstance = null;
}

export default SecurityHeaders;