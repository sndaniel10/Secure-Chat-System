from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from auth import decode_access_token
from database import get_db
from websocket.manager import manager
from hpo.message_queue import enqueue_message
import config

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    # Authenticate via JWT token query parameter
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()
    await manager.connect(websocket, user_id)
    await websocket.send_json({"type": "auth:success", "userId": user_id})

    print(f"[WS] User connected: {user_id}")

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "conversation:join":
                conv_id = data.get("conversationId") or data.get("conversation_id")
                if conv_id:
                    manager.join_room(user_id, conv_id)

            elif msg_type == "message:send":
                await handle_message_send(user_id, data)

            elif msg_type == "user:typing":
                conv_id = data.get("conversationId") or data.get("conversation_id")
                if conv_id:
                    await manager.broadcast_to_room(conv_id, {
                        "type": "user:typing",
                        "userId": user_id,
                        "conversationId": conv_id,
                    }, exclude=user_id)

            elif msg_type == "user:stopTyping":
                conv_id = data.get("conversationId") or data.get("conversation_id")
                if conv_id:
                    await manager.broadcast_to_room(conv_id, {
                        "type": "user:stopTyping",
                        "userId": user_id,
                        "conversationId": conv_id,
                    }, exclude=user_id)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[WS] Error for user {user_id}: {e}")
    finally:
        await manager.disconnect(user_id)
        print(f"[WS] User disconnected: {user_id}")


async def handle_message_send(sender_id: str, data: dict):
    db = get_db()
    msg_data = data.get("data", {})
    request_id = data.get("requestId") or data.get("request_id")

    try:
        now = datetime.now(timezone.utc)

        # Store message in MongoDB
        msg_doc = {
            "conversation_id": msg_data.get("conversationId"),
            "sender_id": sender_id,
            "recipient_id": msg_data.get("recipientId"),
            "ciphertext": msg_data.get("ciphertext", ""),
            "ratchet_header": msg_data.get("ratchetHeader", ""),
            "timestamp": now,
            "delivered": False,
        }
        result = await db.messages.insert_one(msg_doc)
        message_id = str(result.inserted_id)

        # Update conversation timestamp
        from bson import ObjectId
        try:
            await db.conversations.update_one(
                {"_id": ObjectId(msg_data.get("conversationId"))},
                {"$set": {"updated_at": now}},
            )
        except Exception:
            pass

        # Build the packet to send to recipient
        packet = {
            **msg_data,
            "id": message_id,
            "timestamp": int(now.timestamp() * 1000),
        }

        recipient_id = msg_data.get("recipientId")

        if config.HPO_ENABLED and manager.is_online(recipient_id):
            # Route through HPO message queue
            enqueue_message(recipient_id, {
                "type": "real",
                "packet": packet,
                "recipientId": recipient_id,
            })
        elif manager.is_online(recipient_id):
            # Direct delivery
            await manager.send_to_user(recipient_id, {
                "type": "message:receive",
                "data": packet,
            })

        # Acknowledge to sender
        await manager.send_to_user(sender_id, {
            "type": "message:ack",
            "requestId": request_id,
            "success": True,
            "messageId": message_id,
        })

    except Exception as e:
        print(f"[WS] Error saving message: {e}")
        await manager.send_to_user(sender_id, {
            "type": "message:ack",
            "requestId": request_id,
            "success": False,
        })
