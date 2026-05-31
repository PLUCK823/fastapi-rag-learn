"""add document status and error_message

Revision ID: a1b2c3d4e5f6
Revises: 9e6b94f59fa1
Create Date: 2026-05-31 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '0955a8a8de98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'documents',
        sa.Column(
            'status',
            sa.String(20),
            nullable=False,
            server_default='pending',
            comment='文档状态：pending/processing/ready/failed',
        ),
    )
    op.add_column(
        'documents',
        sa.Column(
            'error_message',
            sa.String(1000),
            nullable=True,
            comment='处理失败时的错误信息',
        ),
    )


def downgrade() -> None:
    op.drop_column('documents', 'error_message')
    op.drop_column('documents', 'status')
