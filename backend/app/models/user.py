"""User SQLAlchemy model + fastapi-users Pydantic 校验 schema"""

from fastapi_users import schemas
from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTable
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
    pass

