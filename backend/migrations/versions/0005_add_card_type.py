"""add card_type to flashcards

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-22

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CARD_TYPES = ("basico", "cloze", "multipla_escolha", "verdadeiro_falso", "sequencia", "cenario")


def upgrade() -> None:
    card_type_enum = sa.Enum(*CARD_TYPES, name="card_type")
    card_type_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "flashcards",
        sa.Column(
            "card_type",
            card_type_enum,
            nullable=False,
            server_default="basico",
        ),
    )
    op.add_column("flashcards", sa.Column("metadata_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("flashcards", "metadata_json")
    op.drop_column("flashcards", "card_type")
    op.execute("DROP TYPE IF EXISTS card_type")
