/**
 * WebSocket Connection Integration Tests
 * 
 * Integration tests for WebSocket server connection,
 * authentication, and basic message handling.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import WebSocket from 'ws';
import { CollaborationWebSocketServer } from '../server/websocket-server.js';
import { AuthService } from '../services/AuthService.js';
import type { WebSocketServerConfig, JWTConfig } from '../types/index.js';

describe('WebSocket Connection Integration', () => {
  let server: CollaborationWebSocketServer;
  let authService: AuthService;
  let testToken: string;
  const testPort = 8081; // Use different port for testing

  const serverConfig: WebSocketServerConfig = {
    port: testPort,
    host: 'localhost',
    path: '/test-collaboration',
    pingInterval: 30000,
    pingTimeout: 5000,
    maxConnections: 10,
  };

  const jwtConfig: JWTConfig = {
    secret: 'test-secret-key-for-integration-tests-min-32-chars',
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

  beforeAll(async () => {
    // Create auth service
    authService = new AuthService(dbConfig, jwtConfig);
    
    // Generate test token
    const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
    testToken = await authService.generateToken(mockUserId, 'operator');

    // Create and start server
    server = new CollaborationWebSocketServer(serverConfig, authService);
    await server.start();

    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    await server.stop();
    await authService.close();
  });

  describe('Basic Connection', () => {
    it('should accept WebSocket connections', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}${serverConfig.path}`);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject connections to wrong path', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}/wrong-path`);

      ws.on('error', (error) => {
        expect(error).toBeDefined();
        done();
      });

      // Timeout if connection succeeds (shouldn't happen)
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
          done(new Error('Connection should have been rejected'));
        }
      }, 1000);
    });
  });

  describe('Authentication', () => {
    it('should authenticate with valid token', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}${serverConfig.path}`);

      ws.on('open', () => {
        // Send auth message
        ws.send(JSON.stringify({
          type: 'auth',
          token: testToken,
          sessionId: 'test-session-123',
        }));
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'auth_success') {
          expect(message.userId).toBeDefined();
          expect(message.sessionId).toBe('test-session-123');
          expect(message.role).toBe('operator');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject invalid token', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}${serverConfig.path}`);

      ws.on('open', () => {
        // Send auth message with invalid token
        ws.send(JSON.stringify({
          type: 'auth',
          token: 'invalid-token',
          sessionId: 'test-session-123',
        }));
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'error' || message.type === 'auth_error') {
          expect(message.code).toBeDefined();
          expect(message.message).toContain('authentication');
          done();
        }
      });

      ws.on('close', () => {
        // Connection should be closed after auth failure
        done();
      });

      ws.on('error', (error) => {
        // Expected error
        done();
      });
    });
  });

  describe('Message Handling', () => {
    it('should handle heartbeat messages', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}${serverConfig.path}`);
      let authenticated = false;

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'auth',
          token: testToken,
          sessionId: 'test-session-123',
        }));
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'auth_success' && !authenticated) {
          authenticated = true;
          
          // Send heartbeat
          ws.send(JSON.stringify({
            type: 'heartbeat',
            sessionId: 'test-session-123',
          }));
          
          // Wait a bit then close
          setTimeout(() => {
            ws.close();
            done();
          }, 100);
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should handle session join messages', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}${serverConfig.path}`);
      let authenticated = false;

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'auth',
          token: testToken,
          sessionId: 'test-session-123',
        }));
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'auth_success' && !authenticated) {
          authenticated = true;
          
          // Join session
          ws.send(JSON.stringify({
            type: 'session_join',
            sessionId: 'test-session-123',
          }));
          
          // Wait a bit then close
          setTimeout(() => {
            ws.close();
            done();
          }, 100);
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Connection Management', () => {
    it('should track multiple connections', async () => {
      const ws1 = new WebSocket(`ws://localhost:${testPort}${serverConfig.path}`);
      const ws2 = new WebSocket(`ws://localhost:${testPort}${serverConfig.path}`);

      // Wait for both to connect
      await Promise.all([
        new Promise((resolve) => ws1.on('open', resolve)),
        new Promise((resolve) => ws2.on('open', resolve)),
      ]);

      const stats = server.getStats();
      expect(stats.totalConnections).toBeGreaterThanOrEqual(2);

      ws1.close();
      ws2.close();
    });

    it('should handle connection close', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}${serverConfig.path}`);

      ws.on('open', () => {
        ws.close();
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Server Statistics', () => {
    it('should provide server statistics', () => {
      const stats = server.getStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.totalConnections).toBe('number');
      expect(typeof stats.authenticatedConnections).toBe('number');
      expect(typeof stats.activeSessions).toBe('number');
      expect(typeof stats.uptime).toBe('number');
    });
  });

  describe('Health Check', () => {
    it('should respond to health check endpoint', async () => {
      const response = await fetch(`http://localhost:${testPort}/health`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.connections).toBeDefined();
      expect(data.uptime).toBeDefined();
    });
  });
});