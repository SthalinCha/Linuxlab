from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database.session import get_session
from app.models import User, Role
from app.core.security import get_current_user, hash_password
from app.core.rbac import admin_only
from app.schemas import UserCreate, UserUpdate, UserResponse

router = APIRouter()


def _user_to_response(u: User) -> UserResponse:
    return UserResponse(
        id=u.id,
        username=u.username,
        full_name=u.full_name,
        email=u.email,
        role_id=u.role_id,
        role_name=u.role.name,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


@router.get("")
async def list_users(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(admin_only),
):
    result = await session.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.deleted_at.is_(None))
        .order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    return [_user_to_response(u) for u in users]


@router.get("/me", response_model=UserResponse)
async def get_me(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.id == user.id)
    )
    u = result.scalar_one()
    return _user_to_response(u)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(admin_only),
):
    result = await session.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.id == user_id, User.deleted_at.is_(None))
    )
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return _user_to_response(u)


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(admin_only),
):
    existing = await session.execute(
        select(User).where(User.username == body.username)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El nombre de usuario ya existe")

    existing_email = await session.execute(
        select(User).where(User.email == body.email)
    )
    if body.email and existing_email.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El correo electrónico ya existe")

    role = await session.execute(select(Role).where(Role.name == body.role_name))
    role_obj = role.scalar_one_or_none()
    if not role_obj:
        raise HTTPException(status_code=422, detail=f"Rol no válido: {body.role_name}")

    email = body.email or f"{body.username}@linuxlab.local"

    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        email=email,
        role_id=role_obj.id,
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    result = await session.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.id == new_user.id)
    )
    u = result.scalar_one()
    return _user_to_response(u)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    body: UserUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(admin_only),
):
    result = await session.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.id == user_id, User.deleted_at.is_(None))
    )
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if body.full_name is not None:
        u.full_name = body.full_name
    if body.email is not None:
        u.email = body.email
    if body.role_name is not None:
        role = await session.execute(select(Role).where(Role.name == body.role_name))
        role_obj = role.scalar_one_or_none()
        if not role_obj:
            raise HTTPException(status_code=422, detail=f"Rol no válido: {body.role_name}")
        u.role_id = role_obj.id

    await session.commit()
    await session.refresh(u)

    result = await session.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.id == u.id)
    )
    u = result.scalar_one()
    return _user_to_response(u)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(admin_only),
):
    if user_id == user.id:
        raise HTTPException(status_code=422, detail="No puedes eliminarte a ti mismo")

    result = await session.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.id == user_id, User.deleted_at.is_(None))
    )
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    u.soft_delete()
    await session.commit()
    return {"message": "Usuario eliminado correctamente"}
