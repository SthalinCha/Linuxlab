from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import User, Role
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token, get_current_user, hash_password
from app.core.audit import log_login_event
from app.core.rate_limiter import login_limiter
from app.core.rbac import admin_only
from app.core.config import EMAIL_DOMAIN
from app.schemas import UserLogin, ChangePasswordRequest

router = APIRouter()


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role_name: str = ""


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login", response_model=TokenResponse)
async def login(
    body: UserLogin,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    ip = request.client.host if request.client else "unknown"

    if not await login_limiter.check(ip):
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos. Intente de nuevo en 1 minuto",
        )

    result = await session.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.username == body.username, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        await log_login_event(session, body.username, success=False, ip_address=ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    await login_limiter.reset(ip)
    token_data = {"sub": user.username, "role": user.role.name}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    await log_login_event(session, body.username, success=True, ip_address=ip)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, role_name=user.role.name)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token no es de refresh")
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    result = await session.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.username == username, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    token_data = {"sub": username, "role": user.role.name}
    access_token = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)
    return TokenResponse(access_token=access_token, refresh_token=new_refresh, role_name=user.role.name)


class CreateUserRequest(BaseModel):
    username: str
    password: str
    full_name: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v


@router.post("/register", status_code=201)
async def register_user(
    body: CreateUserRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(admin_only),
):
    existing = await session.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El usuario ya existe")

    role = await session.execute(select(Role).where(Role.name == "admin"))
    admin_role = role.scalar_one_or_none()
    if not admin_role:
        admin_role = Role(name="admin", description="Administrador del sistema")
        session.add(admin_role)
        await session.flush()

    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        email=f"{body.username}@{EMAIL_DOMAIN}",
        role_id=admin_role.id,
    )
    session.add(new_user)
    await session.commit()
    return {"id": new_user.id, "username": new_user.username, "full_name": new_user.full_name}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Reload user from DB to get fresh password_hash (avoid get_current_user cache issues)
    result = await session.execute(
        select(User).where(User.id == current_user.id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contraseña actual incorrecta")

    if body.new_password == body.current_password:
        raise HTTPException(status_code=422, detail="La nueva contraseña debe ser diferente a la actual")

    user.password_hash = hash_password(body.new_password)
    await session.commit()
    return {"message": "Contraseña actualizada correctamente"}
