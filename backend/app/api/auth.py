from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.auth import LoginRequest, TokenResponse, UserCreate, UserOut
from app.models.user import User
from app.services.auth import (
    create_access_token,
    get_current_user,
    get_or_create_user,
    verify_password,
)

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    user = await get_or_create_user(
        db,
        name=payload.name,
        email=payload.email,
        whatsapp_id=payload.whatsapp_id,
        password=payload.password,
    )
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user=UserOut(
            id=str(user.id),
            name=user.name,
            email=user.email,
            whatsapp_id=user.whatsapp_id,
            created_at=user.created_at.isoformat() if user.created_at else "",
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select

    if payload.email:
        result = await db.execute(select(User).where(User.email == payload.email))
    elif payload.whatsapp_id:
        result = await db.execute(select(User).where(User.whatsapp_id == payload.whatsapp_id))
    else:
        raise HTTPException(status_code=400, detail="Forneca email ou whatsapp_id")

    user = result.scalar_one_or_none()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Credenciais invalidas")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais invalidas")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user=UserOut(
            id=str(user.id),
            name=user.name,
            email=user.email,
            whatsapp_id=user.whatsapp_id,
            created_at=user.created_at.isoformat() if user.created_at else "",
        ),
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut(
        id=str(user.id),
        name=user.name,
        email=user.email,
        whatsapp_id=user.whatsapp_id,
        created_at=user.created_at.isoformat() if user.created_at else "",
    )
