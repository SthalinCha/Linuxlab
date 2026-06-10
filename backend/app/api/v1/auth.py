from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.database.models import Admin
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token, get_current_admin, hash_password
from app.core.audit import log_login_event

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    ip = request.client.host if request.client else None
    result = await session.execute(select(Admin).where(Admin.username == body.username, Admin.is_active == True))
    admin = result.scalar_one_or_none()
    if not admin or not verify_password(body.password, admin.password_hash):
        await log_login_event(session, body.username, success=False, ip_address=ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    access_token = create_access_token({"sub": admin.username})
    refresh_token = create_refresh_token({"sub": admin.username})
    await log_login_event(session, body.username, success=True, ip_address=ip)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token no es de refresh")
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    result = await session.execute(select(Admin).where(Admin.username == username, Admin.is_active == True))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin no encontrado")
    access_token = create_access_token({"sub": username})
    new_refresh = create_refresh_token({"sub": username})
    return TokenResponse(access_token=access_token, refresh_token=new_refresh)


class CreateAdminRequest(BaseModel):
    username: str
    password: str
    full_name: str


@router.post("/register", status_code=201)
async def register_admin(
    body: CreateAdminRequest,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    existing = await session.execute(select(Admin).where(Admin.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El usuario ya existe")
    new_admin = Admin(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
    )
    session.add(new_admin)
    await session.commit()
    await session.refresh(new_admin)
    return {"id": new_admin.id, "username": new_admin.username, "full_name": new_admin.full_name}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    if not verify_password(body.current_password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contraseña actual incorrecta")

    if len(body.new_password) < 6:
        raise HTTPException(status_code=422, detail="La nueva contraseña debe tener al menos 6 caracteres")

    if body.new_password == body.current_password:
        raise HTTPException(status_code=422, detail="La nueva contraseña debe ser diferente a la actual")

    admin.password_hash = hash_password(body.new_password)
    await session.commit()
    return {"message": "Contraseña actualizada correctamente"}
