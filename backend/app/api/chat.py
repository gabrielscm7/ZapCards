from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db_read
from app.models.user import User
from app.schemas.chat import ChatMessage, ChatResponse
from app.services.embed import embed_query, search_similar_user
from app.services.llm import chat_with_context
from app.services.auth import get_required_user

router = APIRouter()


@router.post("", response_model=ChatResponse)
async def chat(
    payload: ChatMessage,
    db: AsyncSession = Depends(get_db_read),
    user: User = Depends(get_required_user),
):
    query_embedding = await embed_query(payload.content)
    chunks = await search_similar_user(db, query_embedding, user.id, limit=5)

    if not chunks:
        return ChatResponse(content="Nao encontrei nenhum conteudo sobre isso nos seus estudos. Tente adicionar notas sobre esse assunto primeiro!")

    best_score = chunks[0][1]
    if best_score < settings.SIMILARITY_THRESHOLD:
        return ChatResponse(content="Nao tenho informacao suficiente sobre isso no seu material de estudo. Que tal criar uma nota sobre esse topico?")

    contents = [c[0] for c in chunks]
    scores = [c[1] for c in chunks]
    context = "\n\n".join(contents)
    response = await chat_with_context(payload.content, context)

    sources = [
        f"[{scores[i]:.2f}] {contents[i][:120]}..."
        for i in range(len(contents))
    ]

    return ChatResponse(content=response, sources=sources)
