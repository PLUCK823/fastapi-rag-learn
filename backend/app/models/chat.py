"""ChatMessage SQLAlchemy model"""

from datetime import UTC, datetime

from sqlalchemy import ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kb_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    sources: Mapped[list | None] = mapped_column(JSON, nullable=True)
    feedback: Mapped[bool | None] = mapped_column(
        nullable=True, default=None, comment="用户反馈：True=赞, False=踩, None=无反馈"
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), default=datetime.now(UTC)
    )
