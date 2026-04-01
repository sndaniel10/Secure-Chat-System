import re
from fastapi import APIRouter, Depends, Query
from dependencies import get_current_user
from database import get_db
from bson import ObjectId

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/search")
async def search_users(q: str = Query("", min_length=1), user: dict = Depends(get_current_user)):
    db = get_db()

    # Escape regex special characters
    escaped = re.escape(q)

    results = await db.users.find(
        {
            "username": {"$regex": escaped, "$options": "i"},
            "_id": {"$ne": ObjectId(user["id"])},
        },
        {"_id": 1, "username": 1, "display_name": 1},
    ).limit(10).to_list(10)

    users = []
    for u in results:
        users.append({
            "id": str(u["_id"]),
            "username": u["username"],
            "displayName": u.get("display_name", u["username"]),
        })

    return {"users": users}
