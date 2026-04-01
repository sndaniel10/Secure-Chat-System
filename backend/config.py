import os

# MongoDB
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "hpo_chat")

# JWT
JWT_SECRET = os.getenv("JWT_SECRET", "hpo-chat-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 1440  # 24 hours

# HPO Configuration
CRT_INTERVAL_MS = 500
MAX_QUEUE_DEPTH = 50
COVER_PACKET_SIZE = 1024
BLOCK_SIZES = [1024, 2048, 4096]
HPO_ENABLED = True

# Server
HOST = "0.0.0.0"
PORT = 8000
