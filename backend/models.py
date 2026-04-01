from pydantic import BaseModel, Field
from datetime import datetime


# --- Auth ---
class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    display_name: str = Field(alias="displayName")
    password: str = Field(min_length=8)

    model_config = {"populate_by_name": True}


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str = Field(alias="displayName")

    model_config = {"populate_by_name": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# --- Conversations ---
class ConversationCreate(BaseModel):
    recipient_id: str = Field(alias="recipientId")

    model_config = {"populate_by_name": True}


class ParticipantInfo(BaseModel):
    user: UserResponse


class ConversationResponse(BaseModel):
    id: str
    participants: list[ParticipantInfo]
    messages: list[dict] = []
    created_at: datetime = Field(alias="createdAt", default=None)
    updated_at: datetime = Field(alias="updatedAt", default=None)

    model_config = {"populate_by_name": True}


# --- Keys ---
class OneTimePreKey(BaseModel):
    key_id: int = Field(alias="keyId")
    public_key: str = Field(alias="publicKey")

    model_config = {"populate_by_name": True}


class KeyBundleUpload(BaseModel):
    identity_key_public: str = Field(alias="identityKeyPublic")
    signed_pre_key_public: str = Field(alias="signedPreKeyPublic")
    signed_pre_key_sig: str = Field(alias="signedPreKeySig")
    signed_pre_key_id: int = Field(alias="signedPreKeyId")
    one_time_pre_keys: list[OneTimePreKey] = Field(default=[], alias="oneTimePreKeys")

    model_config = {"populate_by_name": True}


class KeyBundleResponse(BaseModel):
    identity_key: str = Field(alias="identityKey")
    signed_pre_key: str = Field(alias="signedPreKey")
    signed_pre_key_sig: str = Field(alias="signedPreKeySig")
    signed_pre_key_id: int = Field(alias="signedPreKeyId")
    one_time_pre_key: str | None = Field(default=None, alias="oneTimePreKey")
    one_time_pre_key_id: int | None = Field(default=None, alias="oneTimePreKeyId")

    model_config = {"populate_by_name": True}


# --- HPO ---
class HPOToggle(BaseModel):
    enabled: bool


# --- Messages ---
class MessageResponse(BaseModel):
    id: str
    sender_id: str = Field(alias="senderId")
    recipient_id: str = Field(alias="recipientId")
    ciphertext: str
    ratchet_header: str = Field(alias="ratchetHeader")
    timestamp: datetime
    delivered: bool = False

    model_config = {"populate_by_name": True}
