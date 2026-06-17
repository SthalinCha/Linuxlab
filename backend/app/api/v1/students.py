import csv
from io import StringIO
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request, status
from sqlalchemy import select, or_, func, text
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import Student, VMAssignment
from app.core.security import get_current_user
from app.models import User
from app.core.audit import log_event
from app.schemas import StudentCreate, StudentUpdate, StudentResponse

router = APIRouter()


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("")
async def list_students(
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    query = select(Student).where(Student.deleted_at.is_(None))
    if search:
        query = query.where(
            or_(
                Student.full_name.ilike(f"%{search}%"),
                Student.email.ilike(f"%{search}%"),
            )
        )
    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar() or 0

    query = query.order_by(Student.full_name).offset(offset).limit(limit)
    result = await session.execute(query)
    items = [StudentResponse.model_validate(s) for s in result.scalars().all()]
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_student(
    body: StudentCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    existing = await session.execute(
        select(Student).where(Student.email == body.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya existe")
    student_code = body.email.split("@")[0]
    stmt = text(
        "INSERT INTO students (full_name, email, student_code) "
        "VALUES (:full_name, :email, :student_code)"
    ).returning(text("id"))
    result = await session.execute(stmt, {
        "full_name": body.full_name,
        "email": body.email,
        "student_code": student_code,
    })
    row = result.fetchone()
    await session.commit()
    student = await session.get(Student, row[0])
    await log_event(session, "student_create", user.username,
                    f"Creó estudiante {student.full_name}",
                    "student", student.id, ip_address=_ip(request))
    return student


@router.get("/{student_id}")
async def get_student(
    student_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    student = await session.get(Student, student_id)
    if not student or student.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")
    return student


@router.put("/{student_id}")
async def update_student(
    student_id: int,
    body: StudentUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    student = await session.get(Student, student_id)
    if not student or student.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")
    update_data = body.model_dump(exclude_unset=True)
    if "email" in update_data and update_data["email"] != student.email:
        existing = await session.execute(
            select(Student).where(Student.email == update_data["email"], Student.id != student_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya está en uso")
    old_name = student.full_name
    for key, value in update_data.items():
        setattr(student, key, value)
    await session.commit()
    await session.refresh(student)
    await log_event(session, "student_update", user.username,
                    f"Actualizó estudiante {old_name} \u2192 {student.full_name}",
                    "student", student.id, ip_address=_ip(request))
    return student


@router.delete("/{student_id}")
async def delete_student(
    student_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    student = await session.get(Student, student_id)
    if not student or student.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")
    active_assignment = await session.execute(
        select(VMAssignment).where(VMAssignment.student_id == student_id, VMAssignment.released_at.is_(None))
    )
    if active_assignment.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Estudiante tiene asignación activa")
    student.soft_delete()
    await session.commit()
    await log_event(session, "student_deactivate", user.username,
                    f"Desactivó estudiante {student.full_name}",
                    "student", student.id, ip_address=_ip(request))
    return {"message": "Estudiante desactivado"}


@router.post("/import-csv")
async def import_csv(
    file: UploadFile = File(...),
    request: Request = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    content = await file.read()
    reader = csv.DictReader(StringIO(content.decode()))
    rows = list(reader)
    created = 0
    errors = []

    existing_emails = set()
    if rows:
        emails = [r["email"] for r in rows if r.get("email")]
        if emails:
            result = await session.execute(
                select(Student.email).where(Student.email.in_(emails))
            )
            existing_emails = {r[0] for r in result}

    for row in rows:
        if row["email"] in existing_emails:
            errors.append(f"Duplicado: {row.get('email')}")
            continue
        student_code = row.get("student_code") or row["email"].split("@")[0]
        try:
            stmt = text(
                "INSERT INTO students (full_name, email, student_code) "
                "VALUES (:full_name, :email, :student_code)"
            )
            await session.execute(stmt, {
                "full_name": row["full_name"],
                "email": row["email"],
                "student_code": student_code,
            })
            existing_emails.add(row["email"])
            created += 1
        except Exception:
            errors.append(f"Error al insertar: {row.get('email')}")
    await session.commit()
    await log_event(session, "student_import", user.username,
                    f"Importó {created} estudiantes desde CSV (errores: {len(errors)})",
                    "student", ip_address=_ip(request))
    return {"created": created, "errors": errors}


@router.get("/{student_id}/history")
async def student_history(
    student_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(VMAssignment)
        .options(selectinload(VMAssignment.vm), selectinload(VMAssignment.student))
        .where(VMAssignment.student_id == student_id)
        .order_by(VMAssignment.assigned_at.desc())
    )
    return result.scalars().all()
