from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from models import ConversationCreate
from dependencies import get_current_user
from database import get_db
from bson import ObjectId

router = APIRouter(prefix="/api", tags=["conversations"])


def _user_projection():
    return {"_id": 1, "username": 1, "display_name": 1}


async def _format_conversation(db, conv: dict) -> dict:
    """Format a conversation document for the API response."""
    participants = []
    for pid in conv.get("participant_ids", []):
        try:
            user = await db.users.find_one({"_id": ObjectId(pid)}, _user_projection())
        except Exception:
            user = None
        if user:
            participants.append({
                "user": {
                    "id": str(user["_id"]),
                    "username": user["username"],
                    "displayName": user.get("display_name", user["username"]),
                }
            })

    # Get last message
    last_msg = await db.messages.find_one(
        {"conversation_id": str(conv["_id"])},
        sort=[("timestamp", -1)],
    )
    messages = []
    if last_msg:
        messages.append({
            "id": str(last_msg["_id"]),
            "timestamp": last_msg["timestamp"].isoformat(),
            "senderId": last_msg["sender_id"],
        })

    return {
        "id": str(conv["_id"]),
        "participants": participants,
        "messages": messages,
        "createdAt": conv["created_at"].isoformat(),
        "updatedAt": conv["updated_at"].isoformat(),
    }


@router.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    db = get_db()

    convs = await db.conversations.find(
        {"participant_ids": user["id"]}
    ).sort("updated_at", -1).to_list(100)

    conversations = []
    for conv in convs:
        conversations.append(await _format_conversation(db, conv))

    return {"conversations": conversations}


@router.post("/conversations")
async def create_conversation(body: ConversationCreate, user: dict = Depends(get_current_user)):
    db = get_db()

    if not body.recipient_id:
        raise HTTPException(status_code=400, detail="Recipient ID required")

    # Verify recipient exists
    try:
        recipient = await db.users.find_one({"_id": ObjectId(body.recipient_id)})
    except Exception:
        recipient = None

    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Check if conversation already exists
    existing = await db.conversations.find_one({
        "participant_ids": {"$all": [user["id"], body.recipient_id]}
    })

    if existing:
        formatted = await _format_conversation(db, existing)
        return {"conversation": formatted}

    now = datetime.now(timezone.utc)
    conv_doc = {
        "created_at": now,
        "updated_at": now,
        "participant_ids": [user["id"], body.recipient_id],
    }
    result = await db.conversations.insert_one(conv_doc)
    conv_doc["_id"] = result.inserted_id

    formatted = await _format_conversation(db, conv_doc)
    return {"conversation": formatted}


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    cursor: str | None = Query(None),
    user: dict = Depends(get_current_user),
):
    db = get_db()

    # Verify user is a participant
    conv = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conv or user["id"] not in conv.get("participant_ids", []):
        raise HTTPException(status_code=403, detail="Not a participant")

    query = {"conversation_id": conversation_id}
    if cursor:
        try:
            query["_id"] = {"$gt": ObjectId(cursor)}
        except Exception:
            pass

    msgs = await db.messages.find(query).sort("timestamp", -1).limit(50).to_list(50)
    msgs.reverse()

    messages = []
    for msg in msgs:
        messages.append({
            "id": str(msg["_id"]),
            "senderId": msg["sender_id"],
            "recipientId": msg["recipient_id"],
            "ciphertext": msg["ciphertext"],
            "ratchetHeader": msg.get("ratchet_header", ""),
            "timestamp": msg["timestamp"].isoformat(),
            "delivered": msg.get("delivered", False),
        })

    return {"messages": messages}
