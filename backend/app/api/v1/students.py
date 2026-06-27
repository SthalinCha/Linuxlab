import csv
from datetime import datetime, timezone
from io import StringIO
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request, status, Body
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import Student, VMAssignment, Period, VirtualMachine
from app.core.rbac import profesor_only
from app.models import User
from app.core.audit import log_event
from app.schemas import StudentCreate, StudentUpdate, StudentResponse
from app.services.assignment_service import (
    _find_unassigned_students,
    _find_available_vms,
)

router = APIRouter()


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


async def _get_student_or_404(session: AsyncSession, student_id: int, user: User) -> Student:
    student = await session.get(Student, student_id)
    if not student or student.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")
    if user.role.name == "profesor" and student.created_by != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para este estudiante")
    return student


@router.get("")
async def list_students(
    search: Optional[str] = None,
    course_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    query = select(Student).where(Student.deleted_at.is_(None))
    if user.role.name == "profesor":
        query = query.where(Student.created_by == user.id)
    if course_id is not None:
        query = query.where(Student.course_id == course_id)
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
    user: User = Depends(profesor_only),
):
    existing = await session.execute(
        select(Student).where(Student.email == body.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya existe")
    student = Student(
        full_name=body.full_name,
        email=body.email,
        student_code=body.email.split("@")[0],
        created_by=user.id,
        course_id=body.course_id,
    )
    session.add(student)
    await session.commit()
    await log_event(session, "student_create", user.username,
                    f"Creó estudiante {student.full_name}",
                    "student", student.id, ip_address=_ip(request), user_id=user.id,
                    commit=True)
    return student


@router.get("/{student_id}")
async def get_student(
    student_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    return await _get_student_or_404(session, student_id, user)


@router.put("/{student_id}")
async def update_student(
    student_id: int,
    body: StudentUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    student = await _get_student_or_404(session, student_id, user)
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
                    f"Actualizó estudiante {old_name} → {student.full_name}",
                    "student", student.id, ip_address=_ip(request), user_id=user.id,
                    commit=True)
    return student


@router.delete("/{student_id}")
async def delete_student(
    student_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    student = await _get_student_or_404(session, student_id, user)
    active_assignment = await session.execute(
        select(VMAssignment).where(VMAssignment.student_id == student_id, VMAssignment.released_at.is_(None))
    )
    if active_assignment.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Estudiante tiene asignación activa")
    student.soft_delete()
    await session.commit()
    await log_event(session, "student_deactivate", user.username,
                    f"Desactivó estudiante {student.full_name}",
                    "student", student.id, ip_address=_ip(request), user_id=user.id,
                    commit=True)
    return {"message": "Estudiante desactivado"}


@router.post("/import-csv")
async def import_csv(
    file: UploadFile = File(...),
    period_id: Optional[int] = None,
    request: Request = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    content = await file.read()
    reader = csv.DictReader(StringIO(content.decode()))
    rows = list(reader)
    created = 0
    assigned = 0
    unassigned = 0
    errors = []

    csv_student_ids: set[int] = set()
    new_ids: list[int] = []

    for row in rows:
        email = row.get("email", "")
        if not email:
            errors.append("Fila sin email")
            continue
        try:
            student_code = row.get("student_code") or email.split("@")[0]
            student = Student(
                full_name=row["full_name"],
                email=email,
                student_code=student_code,
                created_by=user.id,
                course_id=row.get("course_id") or None,
            )
            session.add(student)
            await session.flush()
            csv_student_ids.add(student.id)
            new_ids.append(student.id)
            created += 1
        except Exception as e:
            errors.append(f"Error al insertar {email}: {e}")

    # Phase 2: auto-assign imported students if period_id provided
    if period_id and csv_student_ids:
        period = await session.get(Period, period_id)
        if not period:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Período no encontrado",
            )

        already_assigned = set()
        result = await session.execute(
            select(VMAssignment.student_id).where(
                VMAssignment.student_id.in_(csv_student_ids),
                VMAssignment.period_id == period_id,
                VMAssignment.released_at.is_(None),
            )
        )
        already_assigned = {r[0] for r in result}
        to_assign_ids = csv_student_ids - already_assigned

        if to_assign_ids:
            students_to_assign = await _find_unassigned_students(
                session, period_id, student_ids=to_assign_ids,
                created_by=user.id,
            )
            available_vms = await _find_available_vms(
                session, period_id,
                owner_id=user.id,
            )

            pairs = list(zip(students_to_assign, available_vms))
            assignment_objs = []
            for student, vm in pairs:
                a = VMAssignment(
                    vm_id=vm.id,
                    student_id=student.id,
                    period_id=period.id,
                    vm_name_snapshot=vm.name,
                    assigned_by=user.id,
                )
                session.add(a)
                assignment_objs.append((a, student, vm))

            await session.flush()

            for a, student, vm in assignment_objs:
                await log_event(
                    session, "assignment_create", user.username,
                    f"Asignación automática (CSV): {vm.name} → {student.full_name}",
                    "assignment", a.id, ip_address=_ip(request), user_id=user.id,
                )

            assigned = len(pairs)
            unassigned = max(0, len(students_to_assign) - assigned)

    await session.commit()
    await log_event(session, "student_import", user.username,
                    f"Importó {created} estudiantes desde CSV ({assigned} asignados, "
                    f"{unassigned} sin VM, errores: {len(errors)})",
                    "student", ip_address=_ip(request), user_id=user.id,
                    commit=True)
    return {
        "created": created,
        "assigned": assigned,
        "unassigned": unassigned,
        "errors": errors,
        "created_ids": new_ids,
    }


@router.post("/undo-import")
async def undo_import(
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
    student_ids: list[int] = Body(...),
    period_id: int | None = Body(None),
):
    if not student_ids:
        return {"deleted_assignments": 0, "deleted_students": 0}

    # Delete all assignments for these students (unconditionally — undoing the import)
    result = await session.execute(
        select(VMAssignment).where(VMAssignment.student_id.in_(student_ids))
    )
    assignments = result.scalars().all()
    for a in assignments:
        await session.delete(a)
    deleted_assignments = len(assignments)

    # Only delete students created by the current user
    result = await session.execute(
        select(Student).where(
            Student.id.in_(student_ids),
            Student.created_by == user.id,
        )
    )
    students = result.scalars().all()
    for student in students:
        await session.delete(student)
    deleted_students = len(students)

    await session.commit()
    await log_event(session, "student_undo_import", user.username,
                    f"Revertida importación: {deleted_students} estudiantes eliminados, {deleted_assignments} asignaciones borradas",
                    "student", ip_address=_ip(request), user_id=user.id,
                    commit=True)
    return {"deleted_assignments": deleted_assignments, "deleted_students": deleted_students}


@router.get("/{student_id}/history")
async def student_history(
    student_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    query = select(VMAssignment).options(
        selectinload(VMAssignment.vm), selectinload(VMAssignment.student)
    ).where(VMAssignment.student_id == student_id)
    query = query.where(VMAssignment.vm.has(owner_id=user.id))
    query = query.order_by(VMAssignment.assigned_at.desc())
    result = await session.execute(query)
    items = result.scalars().all()
    return {"items": items}
