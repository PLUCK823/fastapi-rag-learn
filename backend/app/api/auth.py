"""认证路由：注册 / 登录 / 个人中心 / 刷新令牌"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi_users.password import PasswordHelper
from sqlalchemy.orm import Session

from app.core.auth import (
    ACCESS_TOKEN_LIFETIME,
    auth_backend,
    fastapi_users,
    get_jwt_strategy,
)
from app.core.database import get_sync_session
from app.models.schemas import NicknameRequest, PasswordChangeRequest, ProfileResponse
from app.models.user import User, UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])

router.include_router(fastapi_users.get_auth_router(auth_backend))
router.include_router(fastapi_users.get_register_router(UserRead, UserCreate))

current_user = fastapi_users.current_user()


@router.get("/me", response_model=ProfileResponse)
def get_profile(user: User = Depends(current_user)):
    return ProfileResponse(id=user.id, email=user.email, nickname=user.nickname)


@router.put("/me", response_model=ProfileResponse)
def update_nickname(
    req: NicknameRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    user = session.merge(user)
    user.nickname = req.nickname.strip() or None
    session.commit()
    session.refresh(user)
    return ProfileResponse(id=user.id, email=user.email, nickname=user.nickname)


@router.put("/me/password")
def change_password(
    req: PasswordChangeRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    user = session.merge(user)
    ph = PasswordHelper()
    valid, _ = ph.verify_and_update(req.old_password, user.hashed_password)
    if not valid:
        raise HTTPException(status_code=400, detail="原密码不正确")

    user.hashed_password = ph.hash(req.new_password)
    session.commit()
    return {"message": "密码已修改"}


@router.post("/refresh")
async def refresh_token(user: User = Depends(current_user)):
    """用当前 token 换取新 token（只要还没过期就可以刷新）"""
    strategy = get_jwt_strategy()
    new_token = await strategy.write_token(user)
    return {
        "access_token": new_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_LIFETIME,
    }
