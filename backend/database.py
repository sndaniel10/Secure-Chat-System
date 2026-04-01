from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from config import MONGODB_URL, DATABASE_NAME

client: AsyncIOMotorClient | None = None
db: AsyncIOMotorDatabase | None = None


async def connect_db():
    global client, db
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    # Create indexes
    await db.users.create_index("username", unique=True)
    await db.pre_keys.create_index([("user_id", 1), ("key_id", 1)], unique=True)
    await db.conversations.create_index("participant_ids")
    await db.messages.create_index("conversation_id")
    await db.messages.create_index([("recipient_id", 1), ("delivered", 1)])
    print(f"[DB] Connected to MongoDB: {DATABASE_NAME}")


async def close_db():
    global client
    if client:
        client.close()
        print("[DB] MongoDB connection closed")


def get_db() -> AsyncIOMotorDatabase:
    if db is None:
        raise RuntimeError("Database not initialized")
    return db
