import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from typing import List, Dict, Any, Optional, Set
import logging
import json
import time
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)

class WebSocketEventType(Enum):
    """Standard WebSocket event types for Phase 4 Real-Time Synchronization Engine."""
    
    # Search Events
    SEARCH_CREATED = "SEARCH_CREATED"
    SEARCH_STARTED = "SEARCH_STARTED"
    SEARCH_PAUSED = "SEARCH_PAUSED"
    SEARCH_RESUMED = "SEARCH_RESUMED"
    SEARCH_STOPPED = "SEARCH_STOPPED"
    SEARCH_COMPLETED = "SEARCH_COMPLETED"
    SEARCH_FAILED = "SEARCH_FAILED"
    
    # Queue Events
    QUEUE_CREATED = "QUEUE_CREATED"
    QUEUE_STARTED = "QUEUE_STARTED"
    QUEUE_PROGRESS = "QUEUE_PROGRESS"
    QUEUE_FINISHED = "QUEUE_FINISHED"
    
    # Worker Events
    WORKER_STARTED = "WORKER_STARTED"
    WORKER_BUSY = "WORKER_BUSY"
    WORKER_IDLE = "WORKER_IDLE"
    WORKER_FAILED = "WORKER_FAILED"
    WORKER_RESTARTED = "WORKER_RESTARTED"
    
    # Lead / Business Events
    BUSINESS_DISCOVERED = "BUSINESS_DISCOVERED"
    BUSINESS_EXTRACTED = "BUSINESS_EXTRACTED"
    LEAD_VALIDATED = "LEAD_VALIDATED"
    LEAD_SAVED = "LEAD_SAVED"
    LEAD_UPDATED = "LEAD_UPDATED"
    
    # Phase 3 - Business Detail Extraction Events
    BUSINESS_OPENED = "BUSINESS_OPENED"
    DETAILS_LOADING = "DETAILS_LOADING"
    PHONE_FOUND = "PHONE_FOUND"
    EMAIL_FOUND = "EMAIL_FOUND"
    WEBSITE_FOUND = "WEBSITE_FOUND"
    ADDRESS_FOUND = "ADDRESS_FOUND"
    SOCIAL_FOUND = "SOCIAL_FOUND"
    LEAD_CREATED = "LEAD_CREATED"
    VALIDATION_PENDING = "VALIDATION_PENDING"
    EXTRACTION_COMPLETED = "EXTRACTION_COMPLETED"
    
    # Field Events (Legacy)
    DUPLICATE_FOUND = "DUPLICATE_FOUND"
    
    # WhatsApp AI Events
    WA_CAMPAIGN_STARTED = "WA_CAMPAIGN_STARTED"
    WA_CAMPAIGN_PAUSED = "WA_CAMPAIGN_PAUSED"
    WA_CAMPAIGN_RESUMED = "WA_CAMPAIGN_RESUMED"
    WA_CAMPAIGN_CANCELLED = "WA_CAMPAIGN_CANCELLED"
    WA_CAMPAIGN_COMPLETED = "WA_CAMPAIGN_COMPLETED"
    WA_LEAD_STARTED = "WA_LEAD_STARTED"
    WA_LEAD_OPENING = "WA_LEAD_OPENING"
    WA_LEAD_TYPING = "WA_LEAD_TYPING"
    WA_LEAD_SENDING = "WA_LEAD_SENDING"
    WA_LEAD_SENT = "WA_LEAD_SENT"
    WA_LEAD_FAILED = "WA_LEAD_FAILED"
    WA_LEAD_SKIPPED = "WA_LEAD_SKIPPED"
    
    # Email AI Events
    EMAIL_CAMPAIGN_STARTED = "EMAIL_CAMPAIGN_STARTED"
    EMAIL_CAMPAIGN_PAUSED = "EMAIL_CAMPAIGN_PAUSED"
    EMAIL_CAMPAIGN_RESUMED = "EMAIL_CAMPAIGN_RESUMED"
    EMAIL_CAMPAIGN_CANCELLED = "EMAIL_CAMPAIGN_CANCELLED"
    EMAIL_CAMPAIGN_COMPLETED = "EMAIL_CAMPAIGN_COMPLETED"
    EMAIL_PREPARING = "EMAIL_PREPARING"
    SMTP_CONNECTING = "SMTP_CONNECTING"
    SMTP_CONNECTED = "SMTP_CONNECTED"
    EMAIL_SENDING = "EMAIL_SENDING"
    EMAIL_SENT = "EMAIL_SENT"
    EMAIL_FAILED = "EMAIL_FAILED"
    EMAIL_SKIPPED = "EMAIL_SKIPPED"
    
    # System Events
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"
    
    # Recovery & Stats
    RECOVERY_STARTED = "RECOVERY_STARTED"
    RECOVERY_COMPLETED = "RECOVERY_COMPLETED"
    STATISTICS_UPDATED = "STATISTICS_UPDATED"
    
    # System
    HEARTBEAT = "HEARTBEAT"
    LOG = "LOG"  # for backwards compatibility with legacy timelines


class ConnectionManager:
    """Centralized Phase 4 Connection Manager for the Event Engine."""
    
    def __init__(self):
        # Maps job_id -> Set of WebSockets
        self.rooms: Dict[str, Set[WebSocket]] = {}
        # Keep track of all active connections
        self.active_connections: Dict[WebSocket, Dict[str, Any]] = {}
        # Lock for thread-safe operations
        self._lock = asyncio.Lock()
        # Global broadcast subscribers (for system-wide events)
        self._global_subscribers: Set[WebSocket] = set()
        
    async def connect(self, websocket: WebSocket, job_id: Optional[str] = None):
        """Connect and register a new client (either for a job room or globally)."""
        await websocket.accept()
        async with self._lock:
            if job_id:
                self.active_connections[websocket] = {
                    'job_id': job_id,
                    'connected_at': time.time(),
                    'last_ping': time.time()
                }
                if job_id not in self.rooms:
                    self.rooms[job_id] = set()
                self.rooms[job_id].add(websocket)
                logger.info(f"SOCKET_CONNECTED: WebSocket connected for job {job_id}")
            else:
                self._global_subscribers.add(websocket)
                logger.info("SOCKET_CONNECTED: WebSocket connected globally")

    async def disconnect(self, websocket: WebSocket, job_id: Optional[str] = None):
        """Gracefully disconnect and cleanup."""
        async with self._lock:
            # Fallback to fetch job_id if not provided
            if not job_id and websocket in self.active_connections:
                job_id = self.active_connections[websocket]['job_id']
                
            if websocket in self.active_connections:
                del self.active_connections[websocket]
                
            if job_id and job_id in self.rooms:
                self.rooms[job_id].discard(websocket)
                if not self.rooms[job_id]:
                    del self.rooms[job_id]
                    
            if websocket in self._global_subscribers:
                self._global_subscribers.discard(websocket)
                
        logger.info(f"SOCKET_DISCONNECTED: WebSocket disconnected for job {job_id}")

    async def broadcast_to_job(self, job_id: str, message: dict):
        """Broadcast an event to clients listening to a specific job and all global subscribers."""
        async with self._lock:
            connections = list(self.rooms.get(job_id, set()))
            global_subs = list(self._global_subscribers)
            
        all_recipients = list(set(connections + global_subs))
        if not all_recipients:
            return
            
        stale_connections = []
        for connection in all_recipients:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"EVENT_DELIVERY_FAILED: WebSocket send error for job {job_id}: {str(e)}")
                stale_connections.append(connection)

        # Cleanup stale/orphan sockets instantly
        if stale_connections:
            for conn in stale_connections:
                await self.disconnect(conn, job_id)

    async def broadcast_event(self, job_id: str, event_type: str, message: str, data: Optional[Dict[str, Any]] = None, error: Optional[str] = None):
        """Helper to format and broadcast structured events to a job room."""
        payload = {
            "type": "event",
            "event_type": event_type,
            "message": message,
            "data": data or {},
            "error": error,
            "timestamp": time.time()
        }
        await self.broadcast_to_job(job_id, payload)
        logger.info(f"EVENT_DELIVERED: {event_type} for job {job_id}")

    async def broadcast(self, message: dict):
        """
        Broadcast a message to all connected WebSocket clients.
        This is a fault-tolerant method that never raises exceptions.
        Removes disconnected clients automatically.
        
        Args:
            message: Dictionary to send as JSON to all clients
        """
        if not message:
            return
            
        # Collect all (connection, job_id) pairs so we can pass job_id to
        # disconnect() even if the connection is not in active_connections.
        stale_pairs: list = []   # list of (WebSocket, job_id)
        
        connection_map: dict = {}  # WebSocket -> job_id
        async with self._lock:
            for jid, connections in self.rooms.items():
                for conn in connections:
                    connection_map[conn] = jid
            # Global subscribers have no job_id
            for conn in self._global_subscribers:
                connection_map.setdefault(conn, None)
        
        if not connection_map:
            logger.debug("BROADCAST: No active WebSocket connections")
            return
        
        # Send to all connections
        for connection, jid in connection_map.items():
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"BROADCAST_FAILED: WebSocket send error (job={jid}): {str(e)}")
                stale_pairs.append((connection, jid))
        
        # Clean up stale connections — always pass job_id so rooms are updated
        if stale_pairs:
            for conn, jid in stale_pairs:
                try:
                    await self.disconnect(conn, jid)
                except Exception:
                    pass  # Already disconnected
            logger.info(f"BROADCAST_CLEANUP: Removed {len(stale_pairs)} stale connections")

    async def broadcast_global(self, message: dict):
        """
        Broadcast to all global subscribers (system-wide events).
        Fault-tolerant - never raises exceptions.
        """
        if not self._global_subscribers:
            return
            
        stale = []
        for conn in list(self._global_subscribers):
            try:
                await conn.send_json(message)
            except Exception:
                stale.append(conn)
        
        for conn in stale:
            self._global_subscribers.discard(conn)


# Global Hub
manager = ConnectionManager()
