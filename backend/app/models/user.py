"""User SQLAlchemy model + fastapi-users Pydantic 校验 schema"""

from fastapi_users import schemas
from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTable
from pydantic import field_validator
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(SQLAlchemyBaseUserTable[int], Base):
    __tablename__ = "user"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nickname: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)


class UserRead(schemas.BaseUser[int]):
    nickname: str | None = None


class UserCreate(schemas.BaseUserCreate):
    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("密码至少需要6个字符")
        return v

