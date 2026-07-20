from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    email: str | None = None
    password: str | None = None
    whatsapp_id: str | None = None


class UserOut(BaseModel):
    id: str
    name: str
    email: str | None = None
    whatsapp_id: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LoginRequest(BaseModel):
    email: str | None = None
    whatsapp_id: str | None = None
    password: str
