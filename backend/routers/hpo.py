from fastapi import APIRouter, Depends
from models import HPOToggle
from dependencies import get_current_user
import config

router = APIRouter(prefix="/api/hpo", tags=["hpo"])


@router.get("")
async def get_hpo_status(user: dict = Depends(get_current_user)):
    return {"hpoEnabled": config.HPO_ENABLED}


@router.post("")
async def toggle_hpo(body: HPOToggle, user: dict = Depends(get_current_user)):
    config.HPO_ENABLED = body.enabled
    return {"hpoEnabled": config.HPO_ENABLED}
