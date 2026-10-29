import asyncio
import json
import logging
from typing import Dict
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Manages WebSocket connections for the Search Engine live updates.
    """
    def __init__(self):
        # Maps job_id to a list of active WebSockets
        self.active_connections: Dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, job_id: str):
        await websocket.accept()
        if job_id not in self.active_connections:
            self.active_connections[job_id] = []
        self.active_connections[job_id].append(websocket)
        logger.info(f"[WS] Client connected to job {job_id}")

    def disconnect(self, websocket: WebSocket, job_id: str):
        if job_id in self.active_connections:
            if websocket in self.active_connections[job_id]:
                self.active_connections[job_id].remove(websocket)
            if not self.active_connections[job_id]:
                del self.active_connections[job_id]
        logger.info(f"[WS] Client disconnected from job {job_id}")

    async def broadcast_event(self, job_id: str, event_type: str, data: dict, message: str = ""):
        """
        Broadcasts an event to all clients listening to a specific job.
        Format expected by the frontend:
        {
            "type": "event",
            "event_type": "LEAD_SAVED",
            "message": "Saved a lead...",
            "data": {...}
        }
        """
        if job_id not in self.active_connections:
            return
            
        payload = {
            "type": "event",
            "event_type": event_type,
            "message": message,
            "data": data,
            "timestamp": asyncio.get_event_loop().time()
        }
        
        json_payload = json.dumps(payload)
        for connection in self.active_connections[job_id]:
            try:
                await connection.send_text(json_payload)
            except Exception as e:
                logger.error(f"[WS] Failed to send message to client: {e}")

    async def broadcast_new_lead(self, job_id: str, lead_data: dict, total_saved: int):
        """
        Broadcasts a new lead specifically formatted for the frontend table.
        """
        if job_id not in self.active_connections:
            return
            
        payload = {
            "type": "new_lead",
            "lead": lead_data,
            "total_saved": total_saved
        }
        
        json_payload = json.dumps(payload)
        for connection in self.active_connections[job_id]:
            try:
                await connection.send_text(json_payload)
            except Exception as e:
                logger.error(f"[WS] Failed to send new lead to client: {e}")

    async def broadcast_job_stopped(self, job_id: str, progress: int = 0, message: str = "Job stopped by user"):
        """
        Pushes an immediate job_stopped event so the frontend can switch from
        RUNNING to STOPPED without waiting for a refresh or the next poll.

        Payload shape (matches what the frontend merges into job state):
        {
            "type": "event",
            "event_type": "job_stopped",
            "status": "STOPPED",
            "progress": <last progress>,
            "message": "Job stopped by user"
        }
        """
        if job_id not in self.active_connections:
            return

        payload = {
            "type": "event",
            "event_type": "job_stopped",
            "status": "STOPPED",
            "progress": progress or 0,
            "message": message,
            "data": {
                "jobId": job_id,
                "status": "STOPPED",
                "progress": progress or 0,
                "message": message
            },
            "timestamp": asyncio.get_event_loop().time()
        }

        json_payload = json.dumps(payload)
        for connection in self.active_connections[job_id]:
            try:
                await connection.send_text(json_payload)
            except Exception as e:
                logger.error(f"[WS] Failed to send stop message to client: {e}")

    async def broadcast_stats(self, job_id: str, stats: dict):
        """
        Broadcasts statistics at the root level so the frontend can map them directly.
        """
        if job_id not in self.active_connections:
            return
            
        payload = {
            "type": "event",
            "event_type": "STATISTICS_UPDATED",
            "timestamp": asyncio.get_event_loop().time()
        }
        # Merge stats into the root of the payload
        payload.update(stats)
        
        json_payload = json.dumps(payload)
        for connection in self.active_connections[job_id]:
            try:
                await connection.send_text(json_payload)
            except Exception as e:
                logger.error(f"[WS] Failed to send stats to client: {e}")

search_ws_manager = ConnectionManager()
