import sys
import os
from fastapi.testclient import TestClient

# Add backend to Python path
sys.path.insert(0, os.getcwd())

from app.main import app
from app.core.websocket import manager

def run_verification():
    print("====================================================")
    print("RUNNING VERIFICATION FOR REAL-TIME WS SYNCHRONIZATION")
    print("====================================================")
    
    client = TestClient(app)
    
    # Connect to search websocket endpoint
    job_id = "test_sync_job_5"
    print(f"[1] Connecting to WebSocket route: /api/v1/ws/search/{job_id}...")
    
    with client.websocket_connect(f"/api/v1/ws/search/{job_id}") as websocket:
        print("[PASS] WebSocket connection accepted successfully.")
        
        # Test Ping/Pong
        print("[2] Sending ping message...")
        websocket.send_text("ping")
        
        resp = websocket.receive_text()
        print(f"    Received response: '{resp}'")
        if resp != "pong":
            print(f"[FAIL] Expected 'pong' but received '{resp}'")
            sys.exit(1)
        print("[PASS] Ping/Pong exchange validated successfully.")
        
        # Test Broadcast event
        print("[3] Simulating backend EventBus emission...")
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Run broadcast synchronously using the event loop
        loop.run_until_complete(
            manager.broadcast_event(
                job_id=job_id,
                event_type="LEAD_INSERTED",
                message="Lead found: Snap Fitness Winton",
                data={"name": "Snap Fitness Winton"}
            )
        )
        
        # Receive JSON frame
        event_payload = websocket.receive_json()
        print(f"    Received event: {event_payload.get('event_type')} - {event_payload.get('message')}")
        if event_payload.get("event_type") != "LEAD_INSERTED":
            print("[FAIL] Received incorrect event type!")
            sys.exit(1)
        print("[PASS] Realtime Event broadcast delivery validated successfully.")

    print("====================================================")
    print("ALL REAL-TIME SYNCHRONIZATION VERIFICATIONS PASSED")
    print("====================================================")

if __name__ == "__main__":
    run_verification()
