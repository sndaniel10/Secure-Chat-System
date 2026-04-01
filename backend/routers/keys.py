from fastapi import APIRouter, HTTPException, Depends, Query
from models import KeyBundleUpload
from dependencies import get_current_user
from database import get_db
from bson import ObjectId

router = APIRouter(prefix="/api/keys", tags=["keys"])


@router.post("/upload")
async def upload_keys(body: KeyBundleUpload, user: dict = Depends(get_current_user)):
    db = get_db()

    # Update user's key bundle
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {
            "identity_key_public": body.identity_key_public,
            "signed_pre_key_public": body.signed_pre_key_public,
            "signed_pre_key_sig": body.signed_pre_key_sig,
            "signed_pre_key_id": body.signed_pre_key_id,
        }},
    )

    # Upsert one-time pre-keys
    for pk in body.one_time_pre_keys:
        await db.pre_keys.update_one(
            {"user_id": user["id"], "key_id": pk.key_id},
            {"$set": {
                "user_id": user["id"],
                "key_id": pk.key_id,
                "public_key": pk.public_key,
                "used": False,
            }},
            upsert=True,
        )

    return {"success": True}


@router.get("/bundle")
async def get_bundle(userId: str = Query(...), user: dict = Depends(get_current_user)):
    db = get_db()

    try:
        target = await db.users.find_one({"_id": ObjectId(userId)})
    except Exception:
        target = None

    if not target or not target.get("identity_key_public") or not target.get("signed_pre_key_public"):
        raise HTTPException(status_code=404, detail="Key bundle not found")

    # Fetch an unused one-time pre-key
    one_time = await db.pre_keys.find_one(
        {"user_id": userId, "used": False},
        sort=[("key_id", 1)],
    )

    # Mark it as used
    if one_time:
        await db.pre_keys.update_one(
            {"_id": one_time["_id"]},
            {"$set": {"used": True}},
        )

    bundle = {
        "identityKey": target["identity_key_public"],
        "signedPreKey": target["signed_pre_key_public"],
        "signedPreKeySig": target.get("signed_pre_key_sig"),
        "signedPreKeyId": target.get("signed_pre_key_id"),
        "oneTimePreKey": one_time["public_key"] if one_time else None,
        "oneTimePreKeyId": one_time["key_id"] if one_time else None,
    }

    return {"bundle": bundle}
