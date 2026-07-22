"""migrate pgvector index from IVFFlat to HNSW, add note_status

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-22

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_note_chunks_embedding")
    op.execute(
        "CREATE INDEX ix_note_chunks_embedding_hnsw ON note_chunks "
        "USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )

    note_status_enum = sa.Enum("processing", "ready", "failed", name="note_status")
    note_status_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "notes",
        sa.Column(
            "status",
            note_status_enum,
            nullable=False,
            server_default="ready",
        ),
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_note_chunks_embedding_hnsw")
    op.execute(
        "CREATE INDEX ix_note_chunks_embedding ON note_chunks "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )

    op.drop_column("notes", "status")
    op.execute("DROP TYPE IF EXISTS note_status")
