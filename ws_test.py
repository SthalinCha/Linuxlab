import websocket
import json
from app.core.security import create_access_token

token = create_access_token({"sub": "admin"})
print(f"Token (first 30): {token[:30]}...")
try:
    ws = websocket.create_connection(f"ws://localhost:8000/ws/terminal/1?token={token}", timeout=5)
    print("WebSocket connected!")
    ws.close()
except Exception as e:
    print(f"Error: {e}")
