"""fastapi-users 装配：UserManager, JWT auth, current_user 依赖"""

from collections.abc import AsyncGenerator

from fastapi import Depends
from fastapi_users import BaseUserManager, FastAPIUsers, IntegerIDMixin
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import SECRET_KEY
from app.core.database import get_async_session
from app.models.user import User

UserDB = SQLAlchemyUserDatabase[User, int]

ACCESS_TOKEN_LIFETIME = 3600  # 1 小时
REFRESH_TOKEN_LIFETIME = 604800  # 7 天


async def get_user_db(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[UserDB, None]:
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(IntegerIDMixin, BaseUserManager[User, int]):
    pass


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
