import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.websocket import manager
from app.core.intelligence_ws import intelligence_manager
from app.services.ws_manager import ws_manager
from app.services.search_engine.ws import search_ws_manager

from typing import Optional
from jose import jwt, JWTError
from app.core.config import settings as app_settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/events")
async def system_events_websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    """Global system-wide events WebSocket for Phase 5 real-time synchronization."""
    if token:
        try:
            jwt.decode(
                token, 
                app_settings.SECRET_KEY, 
                algorithms=[app_settings.ALGORITHM],
                audience=app_settings.JWT_AUDIENCE,
                issuer=app_settings.JWT_ISSUER
            )
        except JWTError:
            await websocket.accept()
            await websocket.close(code=4003)
            return

    await manager.connect(websocket)
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info(f"System Events WS client connected: {client}")
    
    connection_timeout = 3600  # 1 hour timeout for system events
    message_count = 0
    max_messages = 100000 
    
    try:
        import asyncio
        from datetime import datetime
        
        start_time = asyncio.get_event_loop().time()
        
        while message_count < max_messages:
            if asyncio.get_event_loop().time() - start_time > connection_timeout:
                logger.warning(f"SYSTEM_EVENTS_WS_TIMEOUT: Connection {client} timed out after {connection_timeout}s")
                break
                
            try:
                message = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                message_count += 1
                
                if message == "ping":
                    await websocket.send_text("pong")
                    
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({
                        "type": "heartbeat",
                        "timestamp": datetime.utcnow().isoformat(),
                        "message_count": message_count
                    })
                except Exception:
                    logger.info(f"SYSTEM_EVENTS_WS_DISCONNECTED: Client {client} connection lost during heartbeat")
                    break
            except WebSocketDisconnect:
                logger.info(f"System Events WS client disconnected: {client}")
                break
            except Exception as e:
                logger.error(f"System Events WS error for {client}: {e}")
                break
                
    except Exception as e:
        logger.error(f"SYSTEM_EVENTS_WS_CRITICAL_ERROR: {client}: {str(e)}")
    finally:
        await manager.disconnect(websocket)


@router.websocket("/ws/analysis-updates")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    if token:
        try:
            jwt.decode(
                token, 
                app_settings.SECRET_KEY, 
                algorithms=[app_settings.ALGORITHM],
                audience=app_settings.JWT_AUDIENCE,
                issuer=app_settings.JWT_ISSUER
            )
        except JWTError:
            await websocket.accept()
            await websocket.close(code=4003)
            return

    await manager.connect(websocket)
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info(f"Analysis WS client connected: {client}")
    
    connection_timeout = 300  # 5 minutes timeout
    message_count = 0
    max_messages = 1000  # Prevent memory leaks
    
    try:
        import asyncio
        from datetime import datetime
        
        start_time = asyncio.get_event_loop().time()
        
        while message_count < max_messages:
            # Check timeout
            if asyncio.get_event_loop().time() - start_time > connection_timeout:
                logger.warning(f"ANALYSIS_WS_TIMEOUT: Connection {client} timed out after {connection_timeout}s")
                break
                
            try:
                # We don't expect the client to send much, but we must receive to keep connection alive
                message = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                message_count += 1
                
                # Handle ping/pong for connection health
                if message == "ping":
                    await websocket.send_text("pong")
                    
            except asyncio.TimeoutError:
                # Send heartbeat to check if connection is still alive
                try:
                    await websocket.send_json({
                        "type": "heartbeat",
                        "timestamp": datetime.utcnow().isoformat(),
                        "message_count": message_count
                    })
                except Exception:
                    logger.info(f"ANALYSIS_WS_DISCONNECTED: Client {client} connection lost during heartbeat")
                    break
            except WebSocketDisconnect:
                logger.info(f"Analysis WS client disconnected: {client}")
                break
            except Exception as e:
                logger.error(f"Analysis WS error for {client}: {e}")
                break
                
    except Exception as e:
        logger.error(f"ANALYSIS_WS_CRITICAL_ERROR: {client}: {str(e)}")
    finally:
        await manager.disconnect(websocket)


@router.websocket("/ws/intelligence-updates")
async def intelligence_ws_endpoint(websocket: WebSocket):
    """Real-time dashboard updates endpoint. Broadcasts INTELLIGENCE_KPI_UPDATE events."""
    await intelligence_manager.connect(websocket)
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info(f"Intelligence WS client connected: {client}")
    
    connection_timeout = 300  # 5 minutes timeout
    message_count = 0
    max_messages = 1000  # Prevent memory leaks
    
    try:
        import asyncio
        from datetime import datetime
        
        start_time = asyncio.get_event_loop().time()
        
        while message_count < max_messages:
            # Check timeout
            if asyncio.get_event_loop().time() - start_time > connection_timeout:
                logger.warning(f"INTELLIGENCE_WS_TIMEOUT: Connection {client} timed out after {connection_timeout}s")
                break
                
            try:
                # Keep connection alive — client sends ping messages
                message = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                message_count += 1
                
                # Handle ping/pong for connection health
                if message == "ping":
                    await websocket.send_text("pong")
                    
            except asyncio.TimeoutError:
                # Send heartbeat to check if connection is still alive
                try:
                    await websocket.send_json({
                        "type": "heartbeat",
                        "timestamp": datetime.utcnow().isoformat(),
                        "message_count": message_count
                    })
                except Exception:
                    logger.info(f"INTELLIGENCE_WS_DISCONNECTED: Client {client} connection lost during heartbeat")
                    break
            except WebSocketDisconnect:
                logger.info(f"Intelligence WS client disconnected: {client}")
                break
            except Exception as e:
                logger.error(f"Intelligence WS error for {client}: {e}")
                break
                
    except Exception as e:
        logger.error(f"INTELLIGENCE_WS_CRITICAL_ERROR: {client}: {str(e)}")
    finally:
        intelligence_manager.disconnect(websocket)


@router.websocket("/ws/campaigns/{campaign_id}")
async def campaign_websocket_endpoint(websocket: WebSocket, campaign_id: str, token: Optional[str] = None):
    """
    WebSocket endpoint for real-time WhatsApp campaign updates.
    Frontend connects here to receive live message status updates.
    """
    if token:
        try:
            jwt.decode(
                token,
                app_settings.SECRET_KEY,
                algorithms=[app_settings.ALGORITHM],
                audience=app_settings.JWT_AUDIENCE,
                issuer=app_settings.JWT_ISSUER
            )
        except JWTError:
            await websocket.accept()
            await websocket.close(code=4003)
            return

    await ws_manager.connect(websocket, campaign_id)
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info(f"Campaign WS client connected to campaign {campaign_id}: {client}")

    try:
        import asyncio
        from datetime import datetime

        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if message == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({
                        "type": "heartbeat",
                        "campaign_id": campaign_id,
                        "timestamp": datetime.utcnow().isoformat()
                    })
                except Exception:
                    logger.info(f"Campaign WS disconnected for {campaign_id}: {client}")
                    break
            except WebSocketDisconnect:
                logger.info(f"Campaign WS client disconnected from campaign {campaign_id}: {client}")
                break
            except Exception as e:
                logger.error(f"Campaign WS error for {campaign_id}: {e}")
                break

    except Exception as e:
        logger.error(f"Campaign WS critical error for {campaign_id}: {str(e)}")
    finally:
        ws_manager.disconnect(websocket, campaign_id)

@router.websocket("/ws/search/{job_id}")
async def search_websocket_endpoint(websocket: WebSocket, job_id: str, token: Optional[str] = None):
    """
    WebSocket endpoint for real-time Search Engine updates.
    Broadcasts LEAD_SAVED, SEARCH_PROGRESS, etc.
    """
    if token:
        try:
            jwt.decode(
                token,
                app_settings.SECRET_KEY,
                algorithms=[app_settings.ALGORITHM],
                audience=app_settings.JWT_AUDIENCE,
                issuer=app_settings.JWT_ISSUER
            )
        except JWTError:
            await websocket.accept()
            await websocket.close(code=4003)
            return

    await search_ws_manager.connect(websocket, job_id)
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info(f"Search WS client connected to job {job_id}: {client}")

    try:
        import asyncio
        from datetime import datetime

        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if message == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({
                        "type": "heartbeat",
                        "job_id": job_id,
                        "timestamp": datetime.utcnow().isoformat()
                    })
                except Exception:
                    logger.info(f"Search WS disconnected for {job_id}: {client}")
                    break
            except WebSocketDisconnect:
                logger.info(f"Search WS client disconnected from job {job_id}: {client}")
                break
            except Exception as e:
                logger.error(f"Search WS error for {job_id}: {e}")
                break

    except Exception as e:
        logger.error(f"Search WS critical error for {job_id}: {str(e)}")
    finally:
        search_ws_manager.disconnect(websocket, job_id)
