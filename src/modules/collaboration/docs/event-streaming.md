# Event Streaming Architecture

## Overview

Phase 3 of the real-time collaboration system enables operation event streaming from Python backend to all session participants. Team members can watch security assessment operations in real-time as they execute.

## Architecture

```
┌─────────────────┐
│   Python Ops    │
│  (boo backend)  │
└────────┬────────┘
         │
         │ Events via
         │ PythonEventBridge
         ▼
┌─────────────────┐
│   HTTP API      │
│  (Express)      │
└────────┬────────┘
         │
         │ Forward to
         │ EventStreamingService
         ▼
┌─────────────────┐
│  EventStore     │
│  (Redis + Mem)  │
└────────┬────────┘
         │
         │ Deduplicate
         │ & Rate Limit
         ▼
┌─────────────────┐
│   WebSocket     │
│   Broadcast     │
└────────┬────────┘
         │
         │ Stream to
         │ Subscribers
         ▼
┌─────────────────┐
│ React Clients   │
│ (Viewers)       │
└─────────────────┘
```

## Components

### 1. PythonEventBridge.py

**Location:** [`boo/src/modules/collaboration/bridges/PythonEventBridge.py`](../bridges/PythonEventBridge.py)

**Purpose:** Bridge Python operations to WebSocket collaboration server

**Features:**
- Event queue with overflow handling (1000 events)
- Batch delivery for efficiency (10 events or 0.5s timeout)
- Automatic retry with exponential backoff (3 attempts)
- Connection pooling and keepalive
- Graceful degradation if server unavailable

**Usage:**
```python
from boo.src.modules.handlers.react.react_bridge_handler import ReactBridgeHandler

# Initialize with collaboration
handler = ReactBridgeHandler(
    operation_id="OP_123",
    session_id="session_456",
    user_id="user_789"
)

# Events are automatically forwarded to collaboration server
```

**Environment Variables:**
- `COLLAB_ENABLED`: Enable collaboration mode (true/false)
- `COLLAB_API_URL`: Collaboration HTTP API endpoint
- `COLLAB_API_KEY`: API key for authentication
- `COLLAB_SESSION_ID`: Current session ID
- `COLLAB_USER_ID`: Current user ID

### 2. EventStreamingService.ts

**Location:** [`boo/src/modules/collaboration/services/EventStreamingService.ts`](../services/EventStreamingService.ts)

**Purpose:** Distribute operation events to all session participants

**Features:**
- Real-time event broadcasting to WebSocket clients
- Event deduplication using bloom filter
- Per-operation rate limiting (1000 events/second)
- Event buffering for late joiners (100 events)
- Permission-based event filtering
- Automatic reconnection support

**API:**
```typescript
// Subscribe to operation events
await eventStreaming.subscribe(
  operationId,
  sessionId,
  userId,
  websocket,
  role
);

// Broadcast event to subscribers
await eventStreaming.broadcastEvent(event);

// Unsubscribe
eventStreaming.unsubscribe(operationId, userId);
```

### 3. EventStore.ts

**Location:** [`boo/src/modules/collaboration/services/EventStore.ts`](../services/EventStore.ts)

**Purpose:** Buffer and persist operation events

**Features:**
- In-memory buffer (1000 events per operation)
- Redis persistence with 24h retention
- Event replay for late joiners
- Pagination and filtering
- Search capabilities
- Automatic cleanup

**API:**
```typescript
// Store event
await eventStore.storeEvent(event);

// Get events for operation
const events = await eventStore.getEvents(operationId, {
  limit: 100,
  types: ['tool_start', 'tool_end'],
  startTime: Date.now() - 3600000
});

// Replay events in order
const replay = await eventStore.replayEvents(operationId);
```

### 4. EventDeduplicator.ts

**Location:** [`boo/src/modules/collaboration/utils/EventDeduplicator.ts`](../utils/EventDeduplicator.ts)

**Purpose:** Prevent duplicate event processing

**Features:**
- Bloom filter for memory-efficient deduplication
- Time-based expiration (5s window)
- False positive rate < 1%
- Automatic cleanup
- Thread-safe

**API:**
```typescript
// Create deduplicator
const dedup = new EventDeduplicator({
  windowMs: 5000,
  expectedEvents: 10000
});

// Check for duplicate
if (dedup.isDuplicate(eventId)) {
  return; // Skip duplicate
}

// Mark event as seen
dedup.markSeen(eventId);

// Or combine: check and mark in one operation
if (dedup.checkAndMark(eventId)) {
  return; // Was duplicate
}
```

## Event Flow

### 1. Event Generation (Python)

```python
# In react_bridge_handler.py
def _emit_ui_event(self, event: Dict[str, Any]) -> None:
    # Emit to React UI
    self.emitter.emit(event)
    
    # Forward to collaboration server
    if self.collaboration_enabled:
        emit_collaboration_event(
            event_type=self._map_event_type(event['type']),
            content=self._format_event_content(event),
            operation_id=self.operation_id,
            session_id=self.session_id,
            user_id=self.user_id,
            metadata={'step': self.current_step}
        )
```

### 2. Event Batching (Python Bridge)

```python
# PythonEventBridge batches events
# - Collects up to 10 events
# - Or waits max 0.5 seconds
# - Sends batch via HTTP POST
POST /api/events
{
  "events": [
    {
      "id": "evt_123",
      "type": "tool_start",
      "content": "Starting nmap scan...",
      "timestamp": 1640000000000,
      "operation_id": "OP_123",
      "session_id": "session_456",
      "user_id": "user_789"
    }
  ]
}
```

### 3. Event Processing (WebSocket Server)

```typescript
// HTTP API receives events
app.post('/api/events', async (req, res) => {
  // Validate API key
  // Parse events
  // Forward to EventStreamingService
  
  for (const event of req.body.events) {
    await eventStreaming.broadcastEvent(event);
  }
  
  res.json({ success: true });
});
```

### 4. Event Broadcasting

```typescript
// EventStreamingService.broadcastEvent()
async broadcastEvent(event: OperationEvent) {
  // 1. Check for duplicates
  if (deduplicator.checkAndMark(event.id)) return;
  
  // 2. Store event
  if (config.persistEvents) {
    await eventStore.storeEvent(event);
  }
  
  // 3. Check rate limit
  if (!rateLimiter.canSend()) return;
  
  // 4. Broadcast to subscribers
  for (const subscriber of subscribers) {
    if (shouldDeliverEvent(event, subscriber.role)) {
      ws.send(JSON.stringify({
        type: 'operation.stream',
        event,
        ...
      }));
    }
  }
}
```

### 5. Client Reception (React)

```typescript
// In React component
useEffect(() => {
  const unsubscribe = subscribeToOperation(operationId, (event) => {
    setEvents(prev => [...prev, event]);
  });
  
  return unsubscribe;
}, [operationId]);
```

## Event Types

### Python → Collaboration

- `stdout`: Standard output from tools
- `stderr`: Error output
- `tool_start`: Tool execution started
- `tool_end`: Tool execution completed
- `reasoning`: Agent reasoning/thinking
- `step_header`: Step progression
- `error`: Error events
- `metrics`: Token usage, timing metrics
- `completion`: Operation completed

### WebSocket Messages

**Subscribe to Operation:**
```json
{
  "type": "operation.subscribe",
  "operationId": "OP_123",
  "sessionId": "session_456"
}
```

**Operation Stream Event:**
```json
{
  "type": "operation.stream",
  "operationId": "OP_123",
  "sessionId": "session_456",
  "event": {
    "id": "evt_123",
    "type": "tool_start",
    "content": "Starting scan...",
    "timestamp": 1640000000000
  },
  "eventId": "evt_123",
  "userId": "user_789"
}
```

**Unsubscribe:**
```json
{
  "type": "operation.unsubscribe",
  "operationId": "OP_123",
  "sessionId": "session_456"
}
```

## Configuration

### Environment Variables

```bash
# Event Streaming
COLLAB_EVENT_STREAMING_ENABLED=true
COLLAB_MAX_EVENTS_PER_OP=1000
COLLAB_EVENT_RETENTION_HOURS=24
COLLAB_EVENT_RATE_LIMIT=1000
COLLAB_DEDUPE_WINDOW_MS=5000
COLLAB_EVENT_BUFFER_SIZE=100

# HTTP API for Python Bridge
COLLAB_HTTP_API_ENABLED=true
COLLAB_HTTP_API_PORT=8081
COLLAB_API_KEY_HEADER=X-API-Key
COLLAB_API_KEYS=key1,key2,key3
COLLAB_API_RATE_LIMIT=100
COLLAB_MAX_REQUEST_SIZE=10mb

# Python Integration
COLLAB_ENABLED=true
COLLAB_API_URL=http://localhost:8081/api/events
COLLAB_API_KEY=your-api-key
COLLAB_SESSION_ID=session_456
COLLAB_USER_ID=user_789
```

### TypeScript Configuration

```typescript
const config: EventStreamingConfig = {
  rateLimitPerSecond: 1000,
  deduplicationWindowMs: 5000,
  bufferSize: 100,
  persistEvents: true
};
```

## Performance Characteristics

### Latency

- Event generation (Python): < 1ms
- Queue insertion: < 1ms
- HTTP batch delivery: 50-100ms
- WebSocket broadcast: < 10ms
- **Total p99 latency: < 100ms**

### Throughput

- Events per second per operation: 1000+
- Concurrent operations: 100+
- Total system throughput: 100,000+ events/s

### Memory Usage

- In-memory buffer: ~10MB per operation (1000 events)
- Bloom filter: ~1.2MB (10k events, 1% FP rate)
- Event queue: ~5MB (1000 events)
- **Total per operation: ~16MB**

### Storage

- Redis: ~1KB per event
- 1000 events per operation
- 24h retention
- **~1MB per operation in Redis**

## Scaling Considerations

### Horizontal Scaling

1. **Multiple WebSocket Servers:**
   - Use Redis pub/sub for event distribution
   - Shared EventStore with Redis backend
   - Load balancer with sticky sessions

2. **Event Processing:**
   - Separate HTTP API servers for Python bridge
   - Queue-based architecture (RabbitMQ/Kafka)
   - Worker pool for event processing

### Vertical Scaling

1. **Increase Buffer Sizes:**
   - More events per operation
   - Longer retention period
   - Larger batch sizes

2. **Tune Rate Limits:**
   - Adjust per-operation limits
   - Configure global rate limits
   - Implement burst allowances

## Monitoring

### Metrics to Track

```typescript
// Event Streaming Stats
const stats = eventStreaming.getStats();
/*
{
  activeOperations: 10,
  totalSubscribers: 25,
  dedupStats: {
    recentEventsCount: 150,
    windowMs: 5000
  },
  operationStats: [
    {
      operationId: "OP_123",
      subscribers: 3,
      bufferSize: 50,
      rateLimit: 950.2
    }
  ]
}
*/

// Event Store Stats
const storeStats = eventStore.getStats();
/*
{
  buffer: {
    operationCount: 10,
    totalEvents: 500
  },
  config: {
    maxEventsPerOperation: 1000,
    retentionHours: 24
  }
}
*/

// Python Bridge Stats
bridge = get_bridge()
stats = bridge.get_stats()
"""
{
  'events_sent': 1500,
  'events_failed': 2,
  'batches_sent': 150,
  'connection_errors': 0,
  'queue_size': 5,
  'dropped_events': 0,
  'enabled': True
}
"""
```

### Health Checks

```typescript
// Check event streaming health
const health = {
  streaming: eventStreaming.getStats().activeOperations > 0,
  store: await eventStore.getStats(),
  deduplication: deduplicator.getStats().recentEventsCount < 10000
};
```

## Troubleshooting

### Events Not Appearing

1. **Check Python Bridge:**
   ```python
   bridge = get_bridge()
   if not bridge or not bridge.enabled:
       print("Bridge not enabled!")
   stats = bridge.get_stats()
   print(f"Queue size: {stats['queue_size']}")
   print(f"Dropped: {stats['dropped_events']}")
   ```

2. **Check HTTP API:**
   ```bash
   # Test API endpoint
   curl -X POST http://localhost:8081/api/events \
     -H "X-API-Key: your-key" \
     -H "Content-Type: application/json" \
     -d '{"events":[{"id":"test","type":"stdout","content":"test"}]}'
   ```

3. **Check WebSocket Connection:**
   ```typescript
   // Verify subscription
   const isSubscribed = eventStreaming.isSubscribed(operationId, userId);
   const subscribers = eventStreaming.getSubscribers(operationId);
   ```

### High Latency

1. **Check Rate Limits:**
   - Increase per-operation rate limit
   - Check for rate limit exhaustion
   - Monitor token bucket state

2. **Check Network:**
   - Measure Python → HTTP API latency
   - Check WebSocket connection quality
   - Monitor Redis performance

3. **Optimize Batching:**
   - Reduce batch timeout
   - Increase batch size
   - Tune for your workload

### Memory Issues

1. **Reduce Buffer Sizes:**
   ```typescript
   maxEventsPerOperation: 500  // Down from 1000
   bufferSize: 50  // Down from 100
   ```

2. **Shorter Retention:**
   ```typescript
   eventRetentionHours: 12  // Down from 24
   ```

3. **More Aggressive Cleanup:**
   ```typescript
   cleanupIntervalMs: 1800000  // 30 minutes instead of 1 hour
   ```

## Security Considerations

### API Authentication

- Use strong API keys (32+ characters)
- Rotate keys regularly
- Different keys per environment
- Rate limit per API key

### Event Content

- Sanitize all event content (XSS prevention)
- Validate event structure
- Limit event size (< 10KB)
- Filter sensitive information

### Permission Checks

- Verify session membership
- Check user role before delivery
- Filter events based on permissions
- Audit event access

## Future Enhancements

### Phase 4 Features

1. **Event Replay:**
   - Time-travel debugging
   - Operation recording/playback
   - Event annotations

2. **Advanced Filtering:**
   - Client-side event filtering
   - Subscription filters
   - Event transformations

3. **Analytics:**
   - Event aggregation
   - Performance metrics
   - Usage patterns

4. **Collaboration Features:**
   - Shared cursor positions
   - Real-time annotations
   - Voice/video integration

## References

- [WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)
- [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [Bloom Filters](https://en.wikipedia.org/wiki/Bloom_filter)
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)