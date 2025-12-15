# Collaboration Features Testing Roadmap

## Overview
This document outlines comprehensive test scenarios for the boo collaboration system's untested or undertested features. All tests should follow the existing patterns in `SessionManager.test.ts` and `AuthService.test.ts`.

## Test Coverage Status

### ✅ Fully Tested
- **AuthService**: Token generation, validation, user authentication, permissions (299 lines, 12 test cases)
- **SessionManager**: Session creation, joining, leaving, participant management (partial)
- **WebSocket Connection**: Basic connection handling

### ⚠️ Partially Tested
- **SessionManager**: Missing integration tests with PresenceManager and ActivityLogger
- **PresenceManager**: Exists but needs comprehensive tests
- **Redis Integration**: Basic tests exist, needs error handling and edge cases

### ❌ Not Tested
- **CommentService**: Commenting, threading, mentions, reactions
- **EventStreamingService**: Real-time operation event streaming  
- **PythonEventBridge**: HTTP API for Python operation integration
- **NotificationService**: @mention notifications, real-time delivery
- **Security Components**: InputValidator, RateLimiter, EncryptionService, AuthorizationMiddleware
- **ActivityLogger**: Activity tracking and audit trails
- **EventStore**: In-memory event buffering
- **EventDeduplicator**: Duplicate event prevention
- **Multi-client WebSocket scenarios**: Concurrent users, race conditions

## Priority Test Scenarios

### 1. CommentService (HIGH PRIORITY)

#### Core Functionality
```typescript
describe('CommentService', () => {
  // Thread Management
  - Create top-level comment
  - Create threaded reply (validate parent exists)
  - Create nested replies (multi-level threading)
  - Get comment thread with all replies
  - Limit thread depth

  // Content Management  
  - Edit comment (save version history)
  - Delete comment (soft delete)
  - Prevent deletion of comments with replies
  - Restore deleted comment

  // Mentions & Notifications
  - Extract @mentions from content
  - Notify mentioned users
  - Notify parent comment author on reply
  - Handle invalid mentions
  - Deduplicate mentions

  // Reactions
  - Add reaction to comment
  - Remove reaction
  - Toggle reaction (remove if exists, add if not)
  - Get all reactions for comment
  - Notify comment author of reaction

  // Security & Validation
  - Sanitize XSS in comment content
  - Rate limit comment creation (10/minute)
  - Reject empty comments
  - Reject overly long comments
  - Permission check (author can edit/delete)
  - Operator override permissions

  // Query & Retrieval
  - Get comments by target (event/finding/line)
  - Filter by session
  - Include/exclude deleted comments
  - Sort by timestamp
  - Pagination for large comment threads
});
```

### 2. EventStreamingService (HIGH PRIORITY)

#### Real-time Events
```typescript
describe('EventStreamingService', () => {
  // Event Streaming
  - Stream stdout event to subscribers
  - Stream stderr event to subscribers  
  - Stream tool execution event
  - Stream completion event
  - Buffer events for late joiners

  // Subscription Management
  - Subscribe to operation stream
  - Unsubscribe from operation stream
  - Multiple subscribers receive same events
  - Subscriber receives buffered events on join

  // Event Deduplication
  - Detect duplicate events (same ID within window)
  - Allow duplicate events after time window
  - Handle rapid event bursts

  // Rate Limiting
  - Throttle high-frequency events
  - Batch events when rate exceeded
  - Emit batch summary

  // Metrics & Monitoring
  - Track operation completion
  - Count events per operation
  - Monitor subscriber count
  - Detect stale subscriptions

  // Error Handling
  - Handle Redis connection loss
  - Recover from event parsing errors
  - Handle subscriber disconnection
  - Clean up resources on operation complete
});
```

### 3. PythonEventBridge (HIGH PRIORITY)

#### HTTP API Integration
```typescript
describe('PythonEventBridge', () => {
  // HTTP Endpoints
  - POST /api/events - emit single event
  - POST /api/events/batch - emit event batch
  - GET /api/health - health check
  - Authentication via API key

  // Event Forwarding
  - Forward Python event to WebSocket server
  - Transform Python event format to WebSocket format
  - Handle missing required fields
  - Validate event structure

  // Batching & Performance
  - Batch multiple events efficiently
  - Flush batch on size threshold
  - Flush batch on time threshold
  - Handle batch failures gracefully

  // Retry Logic
  - Retry failed HTTP requests
  - Exponential backoff on failure
  - Max retry limit (3 attempts)
  - Circuit breaker pattern

  // Error Handling
  - Handle WebSocket server unavailable
  - Handle malformed request body
  - Return appropriate HTTP status codes
  - Log errors for debugging
});
```

### 4. Security Components (CRITICAL)

#### InputValidator
```typescript
describe('InputValidator', () => {
  // XSS Prevention
  - Sanitize <script> tags
  - Sanitize event handlers (onclick, onerror)
  - Sanitize javascript: URLs
  - Preserve safe HTML entities
  - Handle nested encoding attacks

  // SQL Injection Prevention  
  - Detect SQL keywords in input
  - Validate parameterized queries
  - Reject string concatenation patterns
  - Test common injection payloads

  // Command Injection Prevention
  - Detect shell metacharacters
  - Validate command arguments
  - Reject command chaining attempts
  - Test subprocess injection

  // Path Traversal Prevention
  - Detect ../ sequences
  - Validate absolute vs relative paths
  - Restrict to allowed directories
  - Handle URL encoding tricks

  // Length & Format Validation
  - Enforce max length limits
  - Validate email format
  - Validate username format
  - Validate URL format
  - Validate UUID format
});
```

#### RateLimiter
```typescript
describe('RateLimiter', () => {
  // Rate Limit Enforcement
  - Enforce per-user rate limits
  - Enforce per-IP rate limits
  - Enforce per-operation rate limits
  - Track multiple limit types simultaneously

  // Sliding Window Algorithm
  - Count requests in time window
  - Slide window correctly over time
  - Reset counter after window expires
  - Handle concurrent requests

  // Exponential Backoff
  - Increase delay after violations
  - Reset delay after compliance
  - Cap maximum delay
  - Track violation count

  // Redis Integration
  - Store rate limit state in Redis
  - Handle Redis connection failures
  - Fallback to memory when Redis down
  - Atomic increment operations

  // Response Handling
  - Return retry-after header
  - Return 429 status code
  - Include remaining quota in response
  - Log rate limit violations
});
```

#### EncryptionService
```typescript
describe('EncryptionService', () => {
  // Encryption/Decryption
  - Encrypt data with AES-256-GCM
  - Decrypt encrypted data correctly
  - Reject tampering (authentication tag)
  - Handle binary and text data

  // Key Management
  - Generate encryption keys securely
  - Derive keys from master key
  - Rotate encryption keys
  - Store keys in secure location
  - Per-record encryption keys

  // Initialization Vectors
  - Generate unique IV per encryption
  - Store IV with ciphertext
  - Never reuse IV with same key
  - Proper IV length (12 bytes for GCM)

  // Error Handling
  - Handle decryption failures gracefully
  - Detect corrupted ciphertext
  - Handle key not found
  - Handle invalid key format
});
```

### 5. NotificationService (MEDIUM PRIORITY)

```typescript
describe('NotificationService', () => {
  // Mention Notifications
  - Create notification for @mention
  - Extract mentioned users
  - Send to multiple mentioned users
  - Include comment context

  // Reply Notifications
  - Notify parent comment author
  - Don't notify if author replies to self
  - Include reply content

  // Reaction Notifications
  - Notify comment author of reaction
  - Batch multiple reactions
  - Don't notify for own reactions

  // Delivery
  - Send via WebSocket to online users
  - Store for offline users
  - Mark as read
  - Delete notification
  - Bulk mark as read

  // Query
  - Get unread notifications
  - Get all notifications
  - Filter by type
  - Pagination
});
```

### 6. Integration Tests (HIGH PRIORITY)

#### Multi-User Scenarios
```typescript
describe('Multi-User Collaboration', () => {
  // Concurrent Operations
  - Multiple users join same session
  - Simultaneous comment creation
  - Concurrent cursor updates
  - Race condition handling

  // Presence Coordination
  - User A sees user B join
  - User B sees user A's cursor
  - Heartbeat maintains presence
  - Timeout marks user away
  - User leaving notifies others

  // Event Broadcasting
  - Event sent to all session participants
  - Late joiner receives buffered events
  - User-specific events (notifications)
  - System-wide events (announcements)

  // Conflict Resolution
  - Simultaneous edits to same comment
  - Concurrent session creation
  - Permission changes during operation
  - Session owner transfer
});
```

#### WebSocket Scenarios
```typescript
describe('WebSocket Communication', () => {
  // Connection Lifecycle
  - Connect and authenticate
  - Reconnect after disconnect
  - Handle authentication failure
  - Graceful shutdown

  // Message Handling
  - Send and receive text messages
  - Handle binary messages
  - Parse JSON messages
  - Handle malformed messages

  // Error Scenarios
  - Network interruption
  - Server restart
  - Client timeout
  - Message queue overflow
  - Slow client handling
});
```

## Test Infrastructure Needs

### Mock Factories
- ✅ UserFactory - exists
- ✅ SessionFactory - exists  
- ✅ CommentFactory - exists
- ❌ EventFactory - needed
- ❌ NotificationFactory - exists
- ❌ ActivityFactory - needed

### Test Helpers
- ✅ sleep, waitForCondition, retry - exist
- ❌ createMockWebSocket - needed
- ❌ simulateNetworkDelay - needed
- ❌ createTestRedisClient - needed  
- ❌ createTestDatabase - needed

### Test Fixtures
- ❌ Sample operation events
- ❌ Sample comment threads
- ❌ Sample WebSocket messages
- ❌ Sample security payloads (XSS, SQL injection)

## Testing Best Practices

### Structure
1. Use descriptive test names: "should [expected behavior] when [condition]"
2. Group related tests with `describe` blocks
3. One assertion concept per test
4. Test happy path + error cases

### Mocking
1. Mock external dependencies (Redis, PostgreSQL)
2. Use factories for test data generation
3. Clear mocks between tests
4. Verify mock calls with specific arguments

### Async Testing
1. Always return promises from async tests
2. Use async/await syntax consistently
3. Set appropriate timeouts for slow operations
4. Clean up resources in afterEach

### Edge Cases
1. Empty input
2. Null/undefined values
3. Boundary conditions
4. Concurrent operations
5. Network failures
6. Resource exhaustion

## Implementation Priority

### Phase 1 (Week 1)
- [ ] CommentService core functionality tests
- [ ] EventStreamingService basic tests
- [ ] InputValidator security tests
- [ ] RateLimiter enforcement tests

### Phase 2 (Week 2)
- [ ] PythonEventBridge HTTP API tests
- [ ] NotificationService delivery tests
- [ ] EncryptionService crypto tests
- [ ] Multi-user integration tests

### Phase 3 (Week 3)
- [ ] WebSocket scenario tests
- [ ] Error recovery tests
- [ ] Performance tests
- [ ] Load tests

## Success Metrics

### Coverage Goals
- Unit tests: 90%+ coverage
- Integration tests: Key user flows covered
- Security tests: All OWASP Top 10 scenarios
- Performance tests: <100ms p95 latency

### Quality Gates
- All tests pass before merge
- No flaky tests (>99% pass rate)
- New features require tests
- Bug fixes require regression tests

## Resources

### Documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [WebSocket Testing](https://github.com/websockets/ws#how-to-test)
- [Redis Mock](https://github.com/stipsan/ioredis-mock)
- [PostgreSQL Test Containers](https://node.testcontainers.org/)

### Tools
- Jest: Test framework
- @jest/globals: Jest APIs
- ioredis-mock: Redis mocking
- pg-mock: PostgreSQL mocking
- ws: WebSocket client/server

## Next Steps

1. Review this roadmap with the team
2. Create test template files for each service
3. Implement Phase 1 tests
4. Set up CI/CD test automation
5. Monitor coverage metrics
6. Iterate based on findings

---

**Last Updated**: 2025-12-14
**Status**: Draft - Pending Review
**Owner**: QA Team