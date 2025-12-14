/**
 * Performance Monitor
 * 
 * Tracks and reports performance metrics for the collaboration system
 */

import { EventEmitter } from 'events';

export interface PerformanceMetrics {
  requestLatency: LatencyMetrics;
  websocketMetrics: WebSocketMetrics;
  databaseMetrics: DatabaseMetrics;
  redisMetrics: RedisMetrics;
  systemMetrics: SystemMetrics;
  eventQueueMetrics: EventQueueMetrics;
}

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  count: number;
  errors: number;
}

export interface WebSocketMetrics {
  activeConnections: number;
  totalConnections: number;
  messagesPerSecond: number;
  avgMessageSize: number;
  errors: number;
}

export interface DatabaseMetrics {
  queryLatency: LatencyMetrics;
  activeConnections: number;
  poolUtilization: number;
  slowQueries: number;
}

export interface RedisMetrics {
  operationLatency: LatencyMetrics;
  cacheHitRate: number;
  memoryUsage: number;
  evictions: number;
}

export interface SystemMetrics {
  memoryUsage: number;
  cpuUsage: number;
  heapUsed: number;
  heapTotal: number;
  uptime: number;
}

export interface EventQueueMetrics {
  depth: number;
  throughput: number;
  avgProcessingTime: number;
  errors: number;
}

export interface PerformanceReport {
  timestamp: Date;
  metrics: PerformanceMetrics;
  alerts: PerformanceAlert[];
  trends: PerformanceTrend[];
}

export interface PerformanceAlert {
  severity: 'warning' | 'critical';
  metric: string;
  message: string;
  value: number;
  threshold: number;
}

export interface PerformanceTrend {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  change: number;
}

/**
 * PerformanceMonitor - Tracks system performance
 */
export class PerformanceMonitor extends EventEmitter {
  private requestLatencies: number[] = [];
  private wsConnections: Set<string> = new Set();
  private wsMessages: number = 0;
  private wsMessageSizes: number[] = [];
  private dbQueries: number[] = [];
  private dbConnections: number = 0;
  private slowQueries: number = 0;
  private redisOps: number[] = [];
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private eventQueue: number = 0;
  private eventProcessingTimes: number[] = [];
  
  private startTime: number = Date.now();
  private intervalId?: NodeJS.Timeout;
  
  // Thresholds for alerts
  private thresholds = {
    requestLatencyP99: 1000, // ms
    wsConnections: 1000,
    dbQueryLatencyP99: 500, // ms
    redisLatencyP99: 50, // ms
    memoryUsage: 0.85, // 85%
    cpuUsage: 0.75, // 75%
    eventQueueDepth: 1000,
  };

  constructor(
    private reportIntervalMs: number = 60000, // 1 minute
    private retentionSamples: number = 1000
  ) {
    super();
  }

  /**
   * Start monitoring
   */
  start(): void {
    this.intervalId = setInterval(() => {
      const report = this.generateReport();
      this.emit('report', report);
      
      // Check for alerts
      report.alerts.forEach(alert => {
        this.emit('alert', alert);
      });
    }, this.reportIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Track request latency
   */
  trackRequest(latencyMs: number, error: boolean = false): void {
    this.requestLatencies.push(latencyMs);
    this.trimArray(this.requestLatencies);
    
    if (error) {
      this.emit('error', { type: 'request', latencyMs });
    }
  }

  /**
   * Track WebSocket connection
   */
  trackWebSocketConnection(connectionId: string, connected: boolean): void {
    if (connected) {
      this.wsConnections.add(connectionId);
    } else {
      this.wsConnections.delete(connectionId);
    }
  }

  /**
   * Track WebSocket message
   */
  trackWebSocketMessage(sizeBytes: number): void {
    this.wsMessages++;
    this.wsMessageSizes.push(sizeBytes);
    this.trimArray(this.wsMessageSizes);
  }

  /**
   * Track database query
   */
  trackDatabaseQuery(latencyMs: number, slow: boolean = false): void {
    this.dbQueries.push(latencyMs);
    this.trimArray(this.dbQueries);
    
    if (slow) {
      this.slowQueries++;
    }
  }

  /**
   * Track database connections
   */
  trackDatabaseConnections(count: number): void {
    this.dbConnections = count;
  }

  /**
   * Track Redis operation
   */
  trackRedisOperation(latencyMs: number): void {
    this.redisOps.push(latencyMs);
    this.trimArray(this.redisOps);
  }

  /**
   * Track cache hit/miss
   */
  trackCacheAccess(hit: boolean): void {
    if (hit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
  }

  /**
   * Track event queue
   */
  trackEventQueue(depth: number, processingTimeMs?: number): void {
    this.eventQueue = depth;
    
    if (processingTimeMs !== undefined) {
      this.eventProcessingTimes.push(processingTimeMs);
      this.trimArray(this.eventProcessingTimes);
    }
  }

  /**
   * Generate performance report
   */
  generateReport(): PerformanceReport {
    const metrics = this.collectMetrics();
    const alerts = this.checkThresholds(metrics);
    const trends = this.analyzeTrends(metrics);
    
    return {
      timestamp: new Date(),
      metrics,
      alerts,
      trends,
    };
  }

  /**
   * Collect all metrics
   */
  private collectMetrics(): PerformanceMetrics {
    return {
      requestLatency: this.calculateLatencyMetrics(this.requestLatencies),
      websocketMetrics: {
        activeConnections: this.wsConnections.size,
        totalConnections: this.wsConnections.size,
        messagesPerSecond: this.wsMessages / (this.reportIntervalMs / 1000),
        avgMessageSize: this.average(this.wsMessageSizes),
        errors: 0,
      },
      databaseMetrics: {
        queryLatency: this.calculateLatencyMetrics(this.dbQueries),
        activeConnections: this.dbConnections,
        poolUtilization: this.dbConnections / 100, // Assuming max 100
        slowQueries: this.slowQueries,
      },
      redisMetrics: {
        operationLatency: this.calculateLatencyMetrics(this.redisOps),
        cacheHitRate: this.cacheHits / (this.cacheHits + this.cacheMisses || 1),
        memoryUsage: process.memoryUsage().heapUsed,
        evictions: 0,
      },
      systemMetrics: this.collectSystemMetrics(),
      eventQueueMetrics: {
        depth: this.eventQueue,
        throughput: this.eventProcessingTimes.length / (this.reportIntervalMs / 1000),
        avgProcessingTime: this.average(this.eventProcessingTimes),
        errors: 0,
      },
    };
  }

  /**
   * Calculate latency metrics (p50, p95, p99)
   */
  private calculateLatencyMetrics(values: number[]): LatencyMetrics {
    if (values.length === 0) {
      return { p50: 0, p95: 0, p99: 0, count: 0, errors: 0 };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      p50: this.percentile(sorted, 0.50),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      count: values.length,
      errors: 0,
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  /**
   * Calculate average
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): SystemMetrics {
    const mem = process.memoryUsage();
    
    return {
      memoryUsage: mem.heapUsed / mem.heapTotal,
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      uptime: (Date.now() - this.startTime) / 1000,
    };
  }

  /**
   * Check thresholds and generate alerts
   */
  private checkThresholds(metrics: PerformanceMetrics): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    
    if (metrics.requestLatency.p99 > this.thresholds.requestLatencyP99) {
      alerts.push({
        severity: 'warning',
        metric: 'request_latency_p99',
        message: 'Request latency P99 exceeds threshold',
        value: metrics.requestLatency.p99,
        threshold: this.thresholds.requestLatencyP99,
      });
    }
    
    if (metrics.websocketMetrics.activeConnections > this.thresholds.wsConnections) {
      alerts.push({
        severity: 'critical',
        metric: 'websocket_connections',
        message: 'WebSocket connections exceed threshold',
        value: metrics.websocketMetrics.activeConnections,
        threshold: this.thresholds.wsConnections,
      });
    }
    
    if (metrics.systemMetrics.memoryUsage > this.thresholds.memoryUsage) {
      alerts.push({
        severity: 'critical',
        metric: 'memory_usage',
        message: 'Memory usage exceeds threshold',
        value: metrics.systemMetrics.memoryUsage,
        threshold: this.thresholds.memoryUsage,
      });
    }
    
    if (metrics.eventQueueMetrics.depth > this.thresholds.eventQueueDepth) {
      alerts.push({
        severity: 'warning',
        metric: 'event_queue_depth',
        message: 'Event queue depth exceeds threshold',
        value: metrics.eventQueueMetrics.depth,
        threshold: this.thresholds.eventQueueDepth,
      });
    }
    
    return alerts;
  }

  /**
   * Analyze performance trends
   */
  private analyzeTrends(metrics: PerformanceMetrics): PerformanceTrend[] {
    // Simplified trend analysis - in production, would compare with historical data
    return [];
  }

  /**
   * Trim array to retention limit
   */
  private trimArray(arr: number[]): void {
    if (arr.length > this.retentionSamples) {
      arr.splice(0, arr.length - this.retentionSamples);
    }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.requestLatencies = [];
    this.wsMessages = 0;
    this.wsMessageSizes = [];
    this.dbQueries = [];
    this.slowQueries = 0;
    this.redisOps = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.eventProcessingTimes = [];
  }
}