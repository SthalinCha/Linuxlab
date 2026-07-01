from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database.session import get_session
from app.models import User, Role
from app.core.security import get_current_user, hash_password
from app.core.rbac import admin_only
from app.core.config import EMAIL_DOMAIN
from app.schemas import UserCreate, UserUpdate, UserResponse
from app.models import VirtualMachine, Student, Course, VMAssignment, AuditLog

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
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(admin_only),
):
    count_result = await session.execute(
        select(func.count()).select_from(
            select(User).where(User.deleted_at.is_(None)).subquery()
        )
    )
    total = count_result.scalar() or 0

    result = await session.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.deleted_at.is_(None))
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    users = result.scalars().all()
    return {"items": [_user_to_response(u) for u in users], "total": total, "limit": limit, "offset": offset}


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
):
    return _user_to_response(user)


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
        select(User).where(User.username == body.username, User.deleted_at.is_(None))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El nombre de usuario ya existe")

    existing_email = await session.execute(
        select(User).where(User.email == body.email, User.deleted_at.is_(None))
    )
    if body.email and existing_email.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El correo electrónico ya existe")

    role = await session.execute(select(Role).where(Role.name == body.role_name))
    role_obj = role.scalar_one_or_none()
    if not role_obj:
        raise HTTPException(status_code=422, detail=f"Rol no válido: {body.role_name}")

    email = body.email or f"{body.username}@{EMAIL_DOMAIN}"

    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        email=email,
        role_id=role_obj.id,
    )
    session.add(new_user)
    await session.commit()

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

    if body.username is not None:
        u.username = body.username
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
    if body.password is not None:
        u.password_hash = hash_password(body.password)

    await session.commit()

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
        .where(User.id == user_id)
    )
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    course_count = await session.execute(
        select(func.count()).select_from(select(Course).where(Course.profesor_id == user_id).subquery())
    )
    if (course_count.scalar() or 0) > 0:
        raise HTTPException(status_code=409, detail="No se puede eliminar: el usuario tiene cursos asignados")

    assignment_count = await session.execute(
        select(func.count()).select_from(select(VMAssignment).where(VMAssignment.assigned_by == user_id).subquery())
    )
    if (assignment_count.scalar() or 0) > 0:
        raise HTTPException(status_code=409, detail="No se puede eliminar: el usuario tiene asignaciones creadas")

    await session.execute(
        VirtualMachine.__table__.update().where(VirtualMachine.owner_id == user_id).values(owner_id=None)
    )
    await session.execute(
        VMAssignment.__table__.update().where(VMAssignment.last_recreated_by == user_id).values(last_recreated_by=None)
    )
    await session.execute(
        Student.__table__.update().where(Student.created_by == user_id).values(created_by=None)
    )
    await session.execute(
        AuditLog.__table__.update().where(AuditLog.user_id == user_id).values(user_id=None)
    )

    await session.delete(u)
    await session.commit()
    return {"message": "Usuario eliminado correctamente"}
