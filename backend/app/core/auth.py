"""fastapi-users 装配：UserManager, JWT auth, current_user 依赖"""

import logging
from collections.abc import AsyncGenerator

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, IntegerIDMixin, models
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import RESET_TOKEN_SECRET, SECRET_KEY
from app.core.database import get_async_session
from app.models.user import User

logger = logging.getLogger(__name__)

UserDB = SQLAlchemyUserDatabase[User, int]

ACCESS_TOKEN_LIFETIME = 3600  # 1 小时
REFRESH_TOKEN_LIFETIME = 604800  # 7 天
RESET_TOKEN_LIFETIME = 3600  # 密码重置 token 1 小时有效


async def get_user_db(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[UserDB, None]:
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(IntegerIDMixin, BaseUserManager[User, int]):
    reset_password_token_secret = RESET_TOKEN_SECRET
    verification_token_secret = RESET_TOKEN_SECRET

    async def on_after_forgot_password(
        self,
        user: models.UP,
        token: str,
        request: Request | None = None,
    ) -> None:
        """打印密码重置链接到日志（开发者通过日志查看 token）"""
        logger.info(
            "Password reset requested for %s — token: %s",
            user.email,
            token,
        )

    async def on_after_reset_password(
        self,
        user: models.UP,
        request: Request | None = None,
    ) -> None:
        logger.info("Password reset successful for %s", user.email)


async def get_user_manager(user_db: UserDB = Depends(get_user_db)):
    yield UserManager(user_db)


bearer_transport = BearerTransport(tokenUrl="auth/login")


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=SECRET_KEY, lifetime_seconds=ACCESS_TOKEN_LIFETIME)


def get_refresh_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=SECRET_KEY, lifetime_seconds=REFRESH_TOKEN_LIFETIME)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, int](
    get_user_manager=get_user_manager,
    auth_backends=[auth_backend],
)

current_user = fastapi_users.current_user()
