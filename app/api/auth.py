"""认证路由：注册 / 登录 / 登出"""

from fastapi import APIRouter

from app.core.auth import auth_backend, fastapi_users
from app.models.user import UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])

router.include_router(fastapi_users.get_auth_router(auth_backend))
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
)
