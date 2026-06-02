"""认证路由：注册 / 登录 / 个人中心 / 刷新令牌"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import exceptions as users_exceptions
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.password import PasswordHelper
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.auth import (
    ACCESS_TOKEN_LIFETIME,
    UserManager,
    fastapi_users,
    get_jwt_strategy,
    get_user_manager,
)
from app.core.database import get_async_session, get_sync_session
from app.models.schemas import NicknameRequest, PasswordChangeRequest, ProfileResponse
from app.models.user import User, UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])

router.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/auth",
)

current_user = fastapi_users.current_user()


@router.post("/login")
async def custom_login(
    request: Request,
    credentials: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_async_session),
):
    """Custom login with distinct Chinese error messages."""
    user_db: SQLAlchemyUserDatabase[User, int] = SQLAlchemyUserDatabase(session, User)
    ph = PasswordHelper()

    # Step 1: look up user by email
    user = await user_db.get_by_email(credentials.username)
    if user is None:
        # User doesn't exist — run the hasher anyway for timing consistency
        ph.hash(credentials.password)
        raise HTTPException(status_code=400, detail="该账号不存在")

    # Step 2: check if active
    if not user.is_active:
        raise HTTPException(status_code=400, detail="该账号已被禁用")

    # Step 3: verify password
    verified, updated_hash = ph.verify_and_update(
        credentials.password, user.hashed_password
    )
    if not verified:
        raise HTTPException(status_code=400, detail="密码错误")

    # Step 4: upgrade hash if needed (e.g. algorithm change)
    if updated_hash is not None:
        user.hashed_password = updated_hash
        await session.commit()

    # Step 5: generate JWT token
    strategy = get_jwt_strategy()
    token = await strategy.write_token(user)

    return {"access_token": token, "token_type": "bearer"}


@router.post("/register", status_code=201, response_model=UserRead)
async def custom_register(
    request: Request,
    user_create: UserCreate,
    user_manager: UserManager = Depends(get_user_manager),
):
    """Custom register with distinct Chinese error messages."""
    try:
        created_user = await user_manager.create(
            user_create, safe=True, request=request
        )
    except users_exceptions.UserAlreadyExists:
        raise HTTPException(status_code=400, detail="该邮箱已被注册")
    except users_exceptions.InvalidPasswordException as e:
        raise HTTPException(status_code=400, detail=str(e.reason))

    return UserRead.model_validate(created_user)


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
