"""
intelligence_ws.py
Dedicated WebSocket manager for the Intelligence Dashboard.
Broadcasts INTELLIGENCE_KPI_UPDATE events when analysis jobs complete.
"""
from fastapi import WebSocket
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class IntelligenceConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Intelligence WS client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Intelligence WS client disconnected. Total: {len(self.active_connections)}")

    async def broadcast_kpi_update(self, payload: Dict[str, Any] = None):
        """Broadcast a KPI update event to all connected intelligence dashboard clients."""
        message = {
            "type": "INTELLIGENCE_KPI_UPDATE",
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
            **(payload or {}),
        }
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Intelligence WS send error: {e}")
                dead.append(connection)
        for conn in dead:
            self.disconnect(conn)

    async def broadcast(self, message: Dict[str, Any]):
        """Generic broadcast to all intelligence dashboard clients."""
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Intelligence WS send error: {e}")
                dead.append(connection)
        for conn in dead:
            self.disconnect(conn)


intelligence_manager = IntelligenceConnectionManager()
