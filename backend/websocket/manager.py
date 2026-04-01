import json
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # user_id -> WebSocket
        self.active_connections: dict[str, WebSocket] = {}
        # user_id -> set of conversation_ids
        self.user_rooms: dict[str, set[str]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        self.active_connections[user_id] = websocket
        self.user_rooms[user_id] = set()

        # Send currently online users to the new connection
        for online_id in self.active_connections:
            if online_id != user_id:
                await self.send_to_user(user_id, {
                    "type": "user:online",
                    "userId": online_id,
                })

        # Notify others
        await self.broadcast({
            "type": "user:online",
            "userId": user_id,
        }, exclude=user_id)

    async def disconnect(self, user_id: str):
        self.active_connections.pop(user_id, None)
        self.user_rooms.pop(user_id, None)

        await self.broadcast({
            "type": "user:offline",
            "userId": user_id,
        })

    def join_room(self, user_id: str, conversation_id: str):
        if user_id in self.user_rooms:
            self.user_rooms[user_id].add(conversation_id)

    async def send_to_user(self, user_id: str, message: dict):
        ws = self.active_connections.get(user_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def broadcast(self, message: dict, exclude: str | None = None):
        for uid, ws in list(self.active_connections.items()):
            if uid != exclude:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

    async def broadcast_to_room(self, conversation_id: str, message: dict, exclude: str | None = None):
        for uid, rooms in self.user_rooms.items():
            if conversation_id in rooms and uid != exclude:
                await self.send_to_user(uid, message)

    def get_online_users(self) -> dict[str, WebSocket]:
        return self.active_connections

    def is_online(self, user_id: str) -> bool:
        return user_id in self.active_connections


manager = ConnectionManager()
