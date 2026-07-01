import csv
from datetime import datetime, timezone
from io import StringIO
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request, status, Body
from fastapi.responses import StreamingResponse
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import Student, VMAssignment, Period, VirtualMachine
from app.core.rbac import profesor_only
from app.models import User
from app.core.audit import log_event
from app.core.operation_lock import operation_lock
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
    await session.flush()
    if body.period_id:
        session.add(VMAssignment(
            vm_id=None,
            student_id=student.id,
            period_id=body.period_id,
            vm_name_snapshot="",
            assigned_by=user.id,
        ))
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
    await session.execute(
        VMAssignment.__table__.delete().where(VMAssignment.student_id == student_id)
    )
    await session.delete(student)
    await session.commit()
    await log_event(session, "student_delete", user.username,
                    f"Eliminó estudiante {student.full_name} y sus asignaciones",
                    "student", student.id, ip_address=_ip(request), user_id=user.id,
                    commit=True)
    return {"message": "Estudiante eliminado"}


@router.post("/import-csv")
async def import_csv(
    file: UploadFile = File(...),
    period_id: Optional[int] = None,
    request: Request = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    lock_key = f"import-csv:{user.id}"
    if not await operation_lock.acquire(lock_key):
        raise HTTPException(status_code=409, detail="Ya hay una importación en progreso")
    try:
        content = await file.read()
        decoded = content.decode("utf-8-sig")  # utf-8-sig elimina BOM automáticamente
        rows: list[dict[str, str | None]] = []
        errors: list[str] = []

        first_line = decoded.split("\n", 1)[0].strip().lower()
        known_headers = {"full_name", "email", "student_code", "course_id"}
        header_tokens = {t.strip() for t in first_line.split(",")}
        has_headers = bool(header_tokens & known_headers)

        if has_headers:
            reader = csv.DictReader(StringIO(decoded))
            for r in reader:
                rows.append({k.strip(): v.strip() if v else "" for k, v in r.items()})
        else:
            raw_reader = csv.reader(StringIO(decoded))
            for r in raw_reader:
                if len(r) < 2 or not r[1].strip():
                    errors.append(f"Fila inválida: {','.join(r)}")
                    continue
                rows.append({"full_name": r[0].strip(), "email": r[1].strip()})

        created = 0
        skipped = 0

        csv_student_ids: set[int] = set()
        new_ids: list[int] = []

        seen_in_csv: set[str] = set()

        # Pre-check: find existing emails & their IDs in DB
        csv_emails = [r.get("email", "").strip() for r in rows if r.get("email", "").strip()]
        existing_emails: set[str] = set()
        existing_student_ids: dict[str, int] = {}
        if csv_emails:
            result = await session.execute(
                select(Student.email, Student.id).where(Student.email.in_(csv_emails))
            )
            for email, sid in result:
                existing_emails.add(email)
                existing_student_ids[email] = sid

        for row in rows:
            email = (row.get("email") or "").strip()
            if not email:
                errors.append("Fila sin email")
                continue
            if email in seen_in_csv:
                errors.append(f"Email duplicado en el CSV: {email}")
                continue
            seen_in_csv.add(email)
            if email in existing_emails:
                skipped += 1
                continue
            try:
                student_code = row.get("student_code") or email.split("@")[0]
                student = Student(
                    full_name=row["full_name"],  # type: ignore[arg-type]
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

        # If all rows failed due to bad format, show a single clean message
        if errors and len(errors) == len(rows) and all(e == "Fila sin email" for e in errors):
            errors.clear()
            errors.append("No se puede subir este CSV. El formato debe ser: nombre completo, correo")

        # Link students to the period (without assigning a VM)
        if period_id:
            all_student_ids = set(new_ids)
            # Also link existing students that don't yet have a period-linking record
            if existing_student_ids:
                existing_sids = list(existing_student_ids.values())
                existing_result = await session.execute(
                    select(VMAssignment.student_id).where(
                        VMAssignment.period_id == period_id,
                        VMAssignment.student_id.in_(existing_sids),
                        VMAssignment.vm_id.is_(None),
                    )
                )
                already_linked = {r[0] for r in existing_result}
                for sid in existing_sids:
                    if sid not in already_linked:
                        all_student_ids.add(sid)

            for sid in all_student_ids:
                session.add(VMAssignment(
                    vm_id=None,
                    student_id=sid,
                    period_id=period_id,
                    vm_name_snapshot="",
                    assigned_by=user.id,
                ))
            await session.flush()

        await session.commit()
        await log_event(session, "student_import", user.username,
                        f"Importó {created} estudiantes desde CSV (errores: {len(errors)})",
                        "student", ip_address=_ip(request), user_id=user.id,
                        commit=True)
        return {
            "created": created,
            "assigned": 0,
            "unassigned": 0,
            "errors": errors,
            "created_ids": new_ids,
        }
    finally:
        operation_lock.release(lock_key)


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
    lock_key = f"undo-import:{user.id}"
    if not await operation_lock.acquire(lock_key):
        raise HTTPException(status_code=409, detail="Ya hay una reversión de importación en progreso")
    try:
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
    finally:
        operation_lock.release(lock_key)


@router.get("/export")
async def export_students(
    period_id: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    query = select(Student).where(
        Student.deleted_at.is_(None),
    )
    if period_id:
        query = query.where(
            Student.id.in_(
                select(VMAssignment.student_id).where(
                    VMAssignment.period_id == period_id,
                )
            )
        )
    query = query.order_by(Student.full_name)
    result = await session.execute(query)
    students = result.scalars().all()

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Nombre Completo", "Correo Electrónico"])
    for s in students:
        writer.writerow([s.full_name, s.email])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=estudiantes.csv"},
    )


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
