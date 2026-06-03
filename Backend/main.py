from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from cryptography.fernet import Fernet
import os
import socket
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="CriptoChat API")

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_local_ips():
    ips = set()
    try:
        hostname = socket.gethostname()
        ips.add(socket.gethostbyname(hostname))
        _, _, aliases = socket.gethostbyname_ex(hostname)
        ips.update(aliases)
    except:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except:
        pass
    return sorted(ips)


class ConnectionManager:
    """Manage WebSocket connections grouped by room.
    active_connections is a dict: room -> { username: WebSocket }
    """

    def __init__(self):
        self.active_connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, room: str, username: str, websocket: WebSocket):
        await websocket.accept()
        if room not in self.active_connections:
            self.active_connections[room] = {}
        self.active_connections[room][username] = websocket

    def disconnect(self, room: str, username: str):
        room_map = self.active_connections.get(room)
        if not room_map:
            return
        room_map.pop(username, None)
        if len(room_map) == 0:
            self.active_connections.pop(room, None)

    async def send_to_user(self, room: str, username: str, message: dict):
        ws = self.active_connections.get(room, {}).get(username)
        if ws:
            try:
                await ws.send_json(message)
            except:
                pass

    async def broadcast(self, room: str, message: dict, exclude: str | None = None, target: str | None = None):
        """If target is provided, deliver only to that user. Otherwise broadcast to all except 'exclude'."""
        if target:
            await self.send_to_user(room, target, message)
            return
        for username, ws in self.active_connections.get(room, {}).items():
            if username != exclude:
                try:
                    await ws.send_json(message)
                except:
                    pass

    def get_users(self, room: str | None = None) -> list[str]:
        if room:
            return list(self.active_connections.get(room, {}).keys())
        users = []
        for rmap in self.active_connections.values():
            users.extend(rmap.keys())
        return users


manager = ConnectionManager()


@app.get("/api/status")
def api_status():
    return {"message": "CriptoChat API", "status": "running"}


@app.get("/api/users")
def get_users(room: str | None = None):
    # If ?room=xyz is provided, return users for that room
    return {"users": manager.get_users(room) if room else manager.get_users()}


@app.get("/api/local-ips")
def local_ips():
    return {"ips": get_local_ips()}


@app.post("/api/generate-key")
def generate_key():
    key = Fernet.generate_key().decode()
    return {"key": key}


@app.websocket("/ws/{room}/{username}")
async def websocket_endpoint(websocket: WebSocket, room: str, username: str):
    # username must be unique within a room
    if username in manager.get_users(room):
        await websocket.accept()
        await websocket.send_json({
            "type": "error",
            "content": "El nombre de usuario ya está en uso"
        })
        await websocket.close()
        return

    await manager.connect(room, username, websocket)
    await manager.broadcast(room, {
        "type": "system",
        "content": f"{username} se ha conectado"
    })

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "message")

            if msg_type == "message":
                # normalize message fields and ACK delivery to sender
                msg = {
                    "type": "message",
                    "sender": username,
                    "content": data.get("content", ""),
                    "mode": data.get("mode", "PLANO"),
                    "encrypted": data.get("encrypted", False),
                    "msg_id": data.get("msg_id"),
                    "target": data.get("target"),
                    "ttl": data.get("ttl"),
                    "contentType": data.get("contentType"),
                    "filename": data.get("filename"),
                    "sig": data.get("sig"),
                }

                # delivery receipt to sender
                try:
                    await manager.send_to_user(room, username, {"type": "receipt", "status": "delivered", "msg_id": msg.get("msg_id")})
                except:
                    pass

                if msg.get("target"):
                    await manager.broadcast(room, msg, target=msg.get("target"))
                else:
                    await manager.broadcast(room, msg, exclude=username)

            elif msg_type == "users":
                await websocket.send_json({
                    "type": "users",
                    "users": manager.get_users(room)
                })

            elif msg_type == "typing":
                await manager.broadcast(room, {"type": "typing", "sender": username}, exclude=username)

            elif msg_type == "public-keys":
                # forward public keys so clients can derive shared secrets
                await manager.broadcast(room, {
                    "type": "public-keys",
                    "sender": username,
                    "ecdhPublic": data.get("ecdhPublic"),
                    "ecdsaPublic": data.get("ecdsaPublic"),
                }, exclude=username)

            elif msg_type == "read":
                # forward read receipt to original sender
                original_sender = data.get("sender")
                if original_sender:
                    await manager.send_to_user(room, original_sender, {"type": "receipt", "status": "read", "msg_id": data.get("msg_id"), "reader": username})

            elif msg_type == "reaction":
                await manager.broadcast(room, {"type": "reaction", "sender": username, "msg_id": data.get("msg_id"), "emoji": data.get("emoji")}, exclude=username)

            else:
                # fallback: forward as-is with sender attached
                await manager.broadcast(room, {**data, "sender": username}, exclude=username)

    except WebSocketDisconnect:
        manager.disconnect(room, username)
        await manager.broadcast(room, {
            "type": "system",
            "content": f"{username} se ha desconectado"
        })


FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


@app.get("/")
async def serve_index():
    if FRONTEND_DIST.exists():
        return FileResponse(FRONTEND_DIST / "index.html")
    return {"message": "CriptoChat API", "status": "running", "frontend": "not built"}


@app.get("/assets/{file_path:path}")
async def serve_assets(file_path: str):
    asset = FRONTEND_DIST / "assets" / file_path
    if asset.exists():
        return FileResponse(asset)
    return {"error": "not found"}


@app.get("/{filename:path}")
async def serve_static(filename: str):
    if filename.startswith("ws/") or filename.startswith("api/"):
        return {"error": "not found"}
    file = FRONTEND_DIST / filename
    if file.exists() and file.is_file():
        return FileResponse(file)
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"error": "not found"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
