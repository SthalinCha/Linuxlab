import csv
from io import StringIO
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.database.models import Student, VMAssignment
from app.core.security import get_current_admin
from app.database.models import Admin
from app.core.audit import log_event

router = APIRouter()


class StudentCreate(BaseModel):
    full_name: str
    email: str
    student_code: str
    notes: Optional[str] = None


class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("")
async def list_students(
    search: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    query = select(Student)
    if search:
        query = query.where(
            or_(
                Student.full_name.ilike(f"%{search}%"),
                Student.email.ilike(f"%{search}%"),
                Student.student_code.ilike(f"%{search}%"),
            )
        )
    query = query.order_by(Student.full_name)
    result = await session.execute(query)
    return result.scalars().all()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_student(
    body: StudentCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    existing = await session.execute(
        select(Student).where(
            or_(Student.email == body.email, Student.student_code == body.student_code)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email o código ya existe")
    student = Student(**body.model_dump())
    session.add(student)
    await session.commit()
    await session.refresh(student)
    await log_event(session, "student_create", admin.username,
                    f"Creó estudiante {student.full_name} ({student.student_code})",
                    "student", student.id, ip_address=_ip(request))
    return student


@router.get("/{student_id}")
async def get_student(
    student_id: int,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    student = await session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")
    return student


@router.put("/{student_id}")
async def update_student(
    student_id: int,
    body: StudentUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    student = await session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")
    update_data = body.model_dump(exclude_unset=True)
    if "email" in update_data and update_data["email"] != student.email:
        existing = await session.execute(
            select(Student).where(Student.email == update_data["email"], Student.id != student_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya está en uso")
    if "student_code" in update_data and update_data["student_code"] != student.student_code:
        existing = await session.execute(
            select(Student).where(Student.student_code == update_data["student_code"], Student.id != student_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Código ya está en uso")
    old_name = student.full_name
    for key, value in update_data.items():
        setattr(student, key, value)
    await session.commit()
    await session.refresh(student)
    await log_event(session, "student_update", admin.username,
                    f"Actualizó estudiante {old_name} → {student.full_name}",
                    "student", student.id, ip_address=_ip(request))
    return student


@router.delete("/{student_id}")
async def delete_student(
    student_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    student = await session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")
    active_assignment = await session.execute(
        select(VMAssignment).where(VMAssignment.id_student == student_id, VMAssignment.released_at.is_(None))
    )
    if active_assignment.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Estudiante tiene asignación activa")
    student.is_active = False
    await session.commit()
    await log_event(session, "student_deactivate", admin.username,
                    f"Desactivó estudiante {student.full_name} ({student.student_code})",
                    "student", student.id, ip_address=_ip(request))
    return {"message": "Estudiante desactivado"}


@router.post("/import-csv")
async def import_csv(
    file: UploadFile = File(...),
    request: Request = None,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    content = await file.read()
    reader = csv.DictReader(StringIO(content.decode()))
    created = 0
    errors = []
    for row in reader:
        existing = await session.execute(
            select(Student).where(
                or_(Student.email == row["email"], Student.student_code == row["student_code"])
            )
        )
        if existing.scalar_one_or_none():
            errors.append(f"Duplicado: {row.get('email')}")
            continue
        student = Student(
            full_name=row["full_name"],
            email=row["email"],
            student_code=row["student_code"],
            notes=row.get("notes"),
        )
        session.add(student)
        created += 1
    await session.commit()
    await log_event(session, "student_import", admin.username,
                    f"Importó {created} estudiantes desde CSV (errores: {len(errors)})",
                    "student", ip_address=_ip(request))
    return {"created": created, "errors": errors}


@router.get("/{student_id}/history")
async def student_history(
    student_id: int,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    result = await session.execute(
        select(VMAssignment)
        .options(selectinload(VMAssignment.vm), selectinload(VMAssignment.student))
        .where(VMAssignment.id_student == student_id)
        .order_by(VMAssignment.assigned_at.desc())
    )
    return result.scalars().all()
