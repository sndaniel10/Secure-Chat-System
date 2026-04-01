from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status
from models import UserCreate, LoginRequest, TokenResponse, UserResponse
from auth import hash_password, verify_password, create_access_token
from database import get_db
from bson import ObjectId

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/register")
async def register(body: UserCreate):
    db = get_db()

    existing = await db.users.find_one({"username": body.username})
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")

    now = datetime.now(timezone.utc)
    user_doc = {
        "username": body.username,
        "display_name": body.display_name,
        "password_hash": hash_password(body.password),
        "created_at": now,
        "updated_at": now,
        "identity_key_public": None,
        "signed_pre_key_public": None,
        "signed_pre_key_sig": None,
        "signed_pre_key_id": None,
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    return {
        "id": user_id,
        "username": body.username,
        "displayName": body.display_name,
    }


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    db = get_db()

    user = await db.users.find_one({"username": body.username})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user_id = str(user["_id"])
    token = create_access_token(user_id, user["username"], user["display_name"])

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            username=user["username"],
            displayName=user["display_name"],
        ),
    )
