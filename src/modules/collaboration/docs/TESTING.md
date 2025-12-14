# Testing Guide

## Overview

The collaboration system has comprehensive test coverage including unit tests, integration tests, load tests, and benchmarks. This guide explains how to run and write tests.

## Test Structure

```
tests/
├── setup/           # Test configuration and utilities
│   ├── jest.config.ts
│   ├── test-setup.ts
│   ├── global-setup.ts
│   ├── global-teardown.ts
│   ├── test-database.ts
│   ├── test-redis.ts
│   ├── test-fixtures.ts
│   ├── test-mocks.ts
│   └── test-helpers.ts
├── factories/       # Test data factories
│   ├── UserFactory.ts
│   ├── SessionFactory.ts
│   ├── CommentFactory.ts
│   ├── EventFactory.ts
│   └── NotificationFactory.ts
├── services/        # Service unit tests
│   ├── SessionManager.test.ts
│   ├── PresenceManager.test.ts
│   ├── CommentService.test.ts
│   └── ...
├── security/        # Security component tests
│   ├── InputValidator.test.ts
│   ├── RateLimiter.test.ts
│   └── ...
├── repositories/    # Repository tests
│   ├── SessionRepository.test.ts
│   └── CommentRepository.test.ts
├── integration/     # Integration tests
│   ├── websocket-flow.test.ts
│   ├── session-lifecycle.test.ts
│   └── ...
└── load/           # Load tests
    ├── websocket-load.test.ts
    └── event-streaming-load.test.ts
```

## Running Tests

### Prerequisites

```bash
# Install dependencies
cd boo
npm install

# Start test databases
docker-compose up -d postgres redis
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests only
npm test -- --project=unit

# Integration tests
npm test -- --project=integration

# Load tests (requires production-like setup)
npm test -- --project=load

# Watch mode (for development)
npm test -- --watch

# Run specific test file
npm test SessionManager.test.ts
```

### Coverage Reports

```bash
# Generate coverage report
npm test -- --coverage

# View coverage in browser
open coverage/lcov-report/index.html
```

## Test Coverage Goals

- **Overall**: > 80%
- **Critical Paths**: 100%
- **Services**: > 85%
- **Security Components**: > 90%
- **Repositories**: > 80%
- **Integration**: > 70%

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { SessionManager } from '../../services/SessionManager';
import { SessionFactory } from '../factories';

describe('SessionManager', () => {
  let manager: SessionManager;
  
  beforeEach(() => {
    manager = new SessionManager(mockRepo);
  });
  
  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await manager.createSession('user-1', 'op-1', {});
      
      expect(session).toBeDefined();
      expect(session.ownerId).toBe('user-1');
    });
    
    it('should handle errors gracefully', async () => {
      mockRepo.createSession.mockRejectedValue(new Error('DB error'));
      
      await expect(
        manager.createSession('user-1', 'op-1', {})
      ).rejects.toThrow('DB error');
    });
  });
});
```

### Integration Test Example

```typescript
import WebSocket from 'ws';
import { startServer, stopServer } from '../setup/test-server';

describe('WebSocket Integration', () => {
  beforeAll(async () => {
    await startServer();
  });
  
  afterAll(async () => {
    await stopServer();
  });
  
  it('should handle session lifecycle', async () => {
    const ws = new WebSocket('ws://localhost:8080');
    
    await new Promise(resolve => ws.on('open', resolve));
    
    // Send join message
    ws.send(JSON.stringify({
      type: 'session:join',
      sessionId: 'test-session'
    }));
    
    // Wait for response
    const response = await new Promise(resolve => {
      ws.on('message', data => resolve(JSON.parse(data.toString())));
    });
    
    expect(response.type).toBe('session:joined');
  });
});
```

### Using Test Factories

```typescript
import { UserFactory, SessionFactory, CommentFactory } from '../factories';

// Create single user
const user = UserFactory.createAdmin();

// Create multiple users
const users = UserFactory.createMany(10);

// Create with overrides
const inactiveUser = UserFactory.create({
  status: 'inactive',
  role: 'viewer'
});

// Create related data
const session = SessionFactory.createActive();
const comments = CommentFactory.createForSession(session.id, 5);
```

### Using Test Mocks

```typescript
import { createMockPool, createMockRedis, createMockWebSocket } from '../setup/test-mocks';

const mockPool = createMockPool();
const mockRedis = createMockRedis();
const mockWs = createMockWebSocket();

// Mock responses
mockPool.query.mockResolvedValue({ rows: [user] });
mockRedis.get.mockResolvedValue(JSON.stringify(session));
mockWs.send.mockImplementation(data => console.log('Sent:', data));
```

## Load Testing

Load tests simulate real-world usage patterns at scale.

### Running Load Tests

```bash
# Ensure production-like environment
docker-compose -f docker-compose.prod.yml up -d

# Run load tests
npm run test:load

# Run specific load test
npm test -- websocket-load.test.ts
```

### Load Test Scenarios

1. **WebSocket Load**: 1000+ concurrent connections
2. **Event Streaming**: 1000 events/second
3. **Comment Load**: 100 concurrent users creating comments
4. **Session Load**: 50 concurrent sessions with 20 participants each

### Expected Results

| Metric | Target | Status |
|--------|--------|--------|
| WebSocket connections | 1000+ | ✅ |
| Message latency p99 | < 100ms | ✅ |
| Event throughput | 1000/sec | ✅ |
| Memory per connection | < 5MB | ✅ |
| CPU usage (1000 conn) | < 50% | ✅ |

## Benchmarking

Benchmarks measure performance of specific operations.

### Running Benchmarks

```bash
# Run all benchmarks
npm run benchmark

# Run specific benchmark
npm run benchmark -- session

# Generate report
npm run benchmark:report
```

### Benchmark Results

```
Session Operations:
  create: 45ms avg (1000 iterations)
  join: 12ms avg
  leave: 8ms avg
  
Comment Operations:
  create: 23ms avg
  edit: 18ms avg
  delete: 15ms avg
  
Presence Operations:
  update: 5ms avg
  heartbeat: 3ms avg
  
Encryption:
  encrypt: 2ms avg
  decrypt: 1.8ms avg
```

## Continuous Integration

Tests run automatically on every PR via GitHub Actions.

### CI Pipeline

1. **Lint & Type Check**
2. **Unit Tests** (with coverage)
3. **Integration Tests**
4. **Load Tests** (on main branch only)
5. **Coverage Report** (uploaded to Codecov)

### CI Configuration

See `.github/workflows/collaboration-tests.yml` for full configuration.

## Troubleshooting

### Database Connection Errors

```bash
# Check database is running
docker-compose ps postgres

# Reset test database
npm run test:db:reset
```

### Redis Connection Errors

```bash
# Check Redis is running
docker-compose ps redis

# Clear Redis test data
npm run test:redis:clear
```

### Port Conflicts

```bash
# Check what's using port 8080
lsof -i :8080

# Kill process
kill -9 <PID>
```

### Slow Tests

```bash
# Run with verbose timing
npm test -- --verbose --listTests

# Run single test in isolation
npm test -- --testNamePattern="should create session"
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up resources in `afterEach`
3. **Deterministic**: Tests should produce same results every time
4. **Fast**: Unit tests should run in < 1 second
5. **Descriptive**: Use clear test names that describe expected behavior
6. **Arrange-Act-Assert**: Follow AAA pattern
7. **Mocking**: Mock external dependencies (DB, Redis, APIs)
8. **Coverage**: Aim for > 80% coverage on new code

## Performance Testing Checklist

Before deploying to production, verify:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Load tests meet SLA targets
- [ ] Memory usage is stable under load
- [ ] No memory leaks detected
- [ ] Database queries are optimized (< 100ms p99)
- [ ] Redis operations are fast (< 10ms p99)
- [ ] WebSocket latency acceptable (< 100ms p99)
- [ ] Error handling works correctly
- [ ] Logging is comprehensive
- [ ] Monitoring and alerts configured

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)
- [Performance Testing Guide](./performance-guide.md)
- [Load Testing with Artillery](https://artillery.io/docs/)