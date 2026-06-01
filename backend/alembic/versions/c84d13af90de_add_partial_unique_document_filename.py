"""add_partial_unique_document_filename

Revision ID: c84d13af90de
Revises: a1b2c3d4e5f6
Create Date: 2026-06-01 20:45:43.452676

在 (kb_id, filename) 上创建部分唯一索引，仅对 status != 'failed' 的行生效。
防止并发上传同名文件时的竞态条件。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c84d13af90de'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_kb_filename_unique "
        "ON documents (kb_id, filename) WHERE status != 'failed'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_documents_kb_filename_unique")
