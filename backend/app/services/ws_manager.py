from typing import Dict, List
from fastapi import WebSocket
from app.core.logger import logger

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, job_id: str):
        await websocket.accept()
        if job_id not in self.active_connections:
            self.active_connections[job_id] = []
        self.active_connections[job_id].append(websocket)
        logger.info(f"WebSocket client connected to job {job_id}. Total: {len(self.active_connections[job_id])}")

    def disconnect(self, websocket: WebSocket, job_id: str):
        if job_id in self.active_connections:
            if websocket in self.active_connections[job_id]:
                self.active_connections[job_id].remove(websocket)
            if not self.active_connections[job_id]:
                del self.active_connections[job_id]
        logger.info(f"WebSocket client disconnected from job {job_id}")

    async def broadcast_to_job(self, job_id: str, message: dict):
        """Send a JSON message to all connected clients for a specific job."""
        if job_id in self.active_connections:
            dead_connections = []
            connections = list(self.active_connections[job_id])
            for connection in connections:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to websocket for job {job_id}: {repr(e)}")
                    dead_connections.append(connection)
            
            # Clean up dead connections
            for dead in dead_connections:
                self.disconnect(dead, job_id)

    async def broadcast(self, message: dict):
        """
        Broadcast a message to all connected WebSocket clients.
        Sends JSON to all active sockets, removes disconnected clients, and logs failures safely.
        """
        if not message:
            return
        
        dead_connections = []
        # Find all active connections across all job_ids
        for job_id, connections in list(self.active_connections.items()):
            for connection in list(connections):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error broadcasting message to job {job_id}: {repr(e)}")
                    dead_connections.append((connection, job_id))
                    
        # Clean up dead connections
        for dead, job_id in dead_connections:
            try:
                self.disconnect(dead, job_id)
            except Exception as e:
                logger.error(f"Error disconnecting dead connection for job {job_id}: {repr(e)}")

ws_manager = ConnectionManager()
