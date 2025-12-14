"""
Python Event Bridge - Connect Python operations to WebSocket collaboration

This bridge monitors Python operation events and forwards them to the
collaboration WebSocket server via HTTP API for real-time distribution
to all session participants.
"""

import os
import json
import logging
import queue
import threading
import time
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, asdict
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


@dataclass
class CollaborationEvent:
    """Event to be sent to collaboration server"""
    id: str
    type: str
    content: str
    timestamp: int
    operation_id: str
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class EventQueue:
    """Thread-safe event queue with overflow handling"""
    
    def __init__(self, maxsize: int = 1000):
        self.queue = queue.Queue(maxsize=maxsize)
        self.dropped_count = 0
        self.lock = threading.Lock()
    
    def put(self, event: CollaborationEvent, block: bool = False) -> bool:
        """Add event to queue, return False if queue is full"""
        try:
            self.queue.put(event, block=block, timeout=0.1)
            return True
        except queue.Full:
            with self.lock:
                self.dropped_count += 1
            logger.warning(f"Event queue full, dropping event {event.id}")
            return False
    
    def get(self, block: bool = True, timeout: Optional[float] = None) -> Optional[CollaborationEvent]:
        """Get event from queue"""
        try:
            return self.queue.get(block=block, timeout=timeout)
        except queue.Empty:
            return None
    
    def size(self) -> int:
        """Get current queue size"""
        return self.queue.qsize()
    
    def get_dropped_count(self) -> int:
        """Get number of dropped events"""
        with self.lock:
            return self.dropped_count


class PythonEventBridge:
    """
    Bridge between Python operations and WebSocket collaboration server
    
    Features:
    - Event queue with overflow handling
    - Batch event delivery for efficiency
    - Automatic retry with exponential backoff
    - Connection pooling and keepalive
    - Graceful degradation if server unavailable
    """
    
    def __init__(
        self,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        batch_size: int = 10,
        batch_timeout: float = 0.5,
        max_retries: int = 3,
        enabled: bool = True
    ):
        """
        Initialize the event bridge
        
        Args:
            api_url: Collaboration server HTTP API URL
            api_key: API key for authentication
            batch_size: Maximum events per batch
            batch_timeout: Maximum time to wait before sending batch (seconds)
            max_retries: Maximum retry attempts for failed requests
            enabled: Whether collaboration is enabled
        """
        self.api_url = api_url or os.getenv(
            'COLLAB_API_URL',
            'http://localhost:8081/api/events'
        )
        self.api_key = api_key or os.getenv('COLLAB_API_KEY', '')
        self.batch_size = batch_size
        self.batch_timeout = batch_timeout
        self.max_retries = max_retries
        self.enabled = enabled and bool(self.api_key)
        
        # Event queue
        self.event_queue = EventQueue(maxsize=1000)
        
        # Batch processing
        self.current_batch: List[CollaborationEvent] = []
        self.last_batch_time = time.time()
        
        # Worker thread
        self.worker_thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        
        # HTTP session with retry logic
        self.session = self._create_session()
        
        # Statistics
        self.stats = {
            'events_sent': 0,
            'events_failed': 0,
            'batches_sent': 0,
            'connection_errors': 0,
        }
        
        # Start worker if enabled
        if self.enabled:
            self.start()
            logger.info(f"PythonEventBridge initialized, API: {self.api_url}")
        else:
            logger.info("PythonEventBridge disabled (no API key or disabled)")
    
    def _create_session(self) -> requests.Session:
        """Create HTTP session with retry logic"""
        session = requests.Session()
        
        # Configure retry strategy
        retry_strategy = Retry(
            total=self.max_retries,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["POST"]
        )
        
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=10,
            pool_maxsize=20
        )
        
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        # Set default headers
        session.headers.update({
            'Content-Type': 'application/json',
            'X-API-Key': self.api_key,
            'User-Agent': 'PythonEventBridge/1.0'
        })
        
        return session
    
    def emit_event(
        self,
        event_type: str,
        content: str,
        operation_id: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Emit an event to the collaboration server
        
        Args:
            event_type: Type of event (stdout, stderr, tool_start, etc.)
            content: Event content
            operation_id: Operation identifier
            session_id: Optional session identifier
            user_id: Optional user identifier
            metadata: Optional event metadata
        
        Returns:
            True if event was queued successfully
        """
        if not self.enabled:
            return False
        
        # Create event
        event = CollaborationEvent(
            id=self._generate_event_id(),
            type=event_type,
            content=content,
            timestamp=int(time.time() * 1000),
            operation_id=operation_id,
            session_id=session_id,
            user_id=user_id,
            metadata=metadata or {}
        )
        
        # Queue event
        return self.event_queue.put(event)
    
    def start(self) -> None:
        """Start the worker thread"""
        if self.worker_thread is not None and self.worker_thread.is_alive():
            return
        
        self.stop_event.clear()
        self.worker_thread = threading.Thread(
            target=self._worker_loop,
            daemon=True,
            name="EventBridgeWorker"
        )
        self.worker_thread.start()
        logger.info("Event bridge worker started")
    
    def stop(self, timeout: float = 5.0) -> None:
        """Stop the worker thread and flush remaining events"""
        if not self.worker_thread or not self.worker_thread.is_alive():
            return
        
        logger.info("Stopping event bridge worker...")
        self.stop_event.set()
        
        # Flush remaining events
        self._flush_batch()
        
        # Wait for worker to finish
        self.worker_thread.join(timeout=timeout)
        
        if self.worker_thread.is_alive():
            logger.warning("Worker thread did not stop gracefully")
        else:
            logger.info("Event bridge worker stopped")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get bridge statistics"""
        return {
            **self.stats,
            'queue_size': self.event_queue.size(),
            'dropped_events': self.event_queue.get_dropped_count(),
            'enabled': self.enabled,
        }
    
    def _worker_loop(self) -> None:
        """Main worker loop for processing events"""
        while not self.stop_event.is_set():
            try:
                # Get event from queue with timeout
                event = self.event_queue.get(block=True, timeout=0.1)
                
                if event:
                    self.current_batch.append(event)
                    
                    # Send batch if size reached or timeout exceeded
                    if (len(self.current_batch) >= self.batch_size or
                        time.time() - self.last_batch_time >= self.batch_timeout):
                        self._flush_batch()
                
            except Exception as e:
                logger.error(f"Error in worker loop: {e}", exc_info=True)
        
        # Final flush on exit
        self._flush_batch()
    
    def _flush_batch(self) -> None:
        """Send current batch to server"""
        if not self.current_batch:
            return
        
        try:
            self._send_batch(self.current_batch)
            self.stats['batches_sent'] += 1
            self.stats['events_sent'] += len(self.current_batch)
        except Exception as e:
            logger.error(f"Failed to send batch: {e}")
            self.stats['events_failed'] += len(self.current_batch)
        finally:
            self.current_batch = []
            self.last_batch_time = time.time()
    
    def _send_batch(self, events: List[CollaborationEvent]) -> None:
        """Send batch of events to server"""
        if not events:
            return
        
        # Convert events to dicts
        payload = {
            'events': [asdict(event) for event in events]
        }
        
        try:
            response = self.session.post(
                self.api_url,
                json=payload,
                timeout=5.0
            )
            
            response.raise_for_status()
            
            logger.debug(f"Sent batch of {len(events)} events to collaboration server")
            
        except requests.exceptions.ConnectionError as e:
            self.stats['connection_errors'] += 1
            logger.warning(f"Connection error sending events: {e}")
            raise
        except requests.exceptions.Timeout as e:
            logger.warning(f"Timeout sending events: {e}")
            raise
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP error sending events: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error sending events: {e}")
            raise
    
    def _generate_event_id(self) -> str:
        """Generate unique event ID"""
        import uuid
        return str(uuid.uuid4())
    
    def __enter__(self):
        """Context manager entry"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.stop()
        return False


# Global bridge instance
_bridge_instance: Optional[PythonEventBridge] = None
_bridge_lock = threading.Lock()


def get_bridge() -> Optional[PythonEventBridge]:
    """Get or create global bridge instance"""
    global _bridge_instance
    
    with _bridge_lock:
        if _bridge_instance is None:
            # Check if collaboration is enabled
            enabled = os.getenv('COLLAB_ENABLED', '').lower() in ('true', '1', 'yes')
            if enabled:
                _bridge_instance = PythonEventBridge()
        
        return _bridge_instance


def emit_collaboration_event(
    event_type: str,
    content: str,
    operation_id: str,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Convenience function to emit an event via the global bridge
    
    Args:
        event_type: Type of event
        content: Event content
        operation_id: Operation identifier
        session_id: Optional session identifier
        user_id: Optional user identifier
        metadata: Optional event metadata
    
    Returns:
        True if event was queued successfully
    """
    bridge = get_bridge()
    if bridge:
        return bridge.emit_event(
            event_type=event_type,
            content=content,
            operation_id=operation_id,
            session_id=session_id,
            user_id=user_id,
            metadata=metadata
        )
    return False


def stop_bridge():
    """Stop the global bridge instance"""
    global _bridge_instance
    
    with _bridge_lock:
        if _bridge_instance:
            _bridge_instance.stop()
            _bridge_instance = None


# Register cleanup on exit
import atexit
atexit.register(stop_bridge)