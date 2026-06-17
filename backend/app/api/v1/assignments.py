from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, and_, func, case
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import VMAssignment, Student, VirtualMachine, Period
from app.core.security import get_current_user
from app.models import User
from app.core.audit import log_event

router = APIRouter()


class AssignmentCreate(BaseModel):
    vm_id: int | None = None
    student_id: int
    period_id: int
    notes: Optional[str] = None


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("")
async def list_assignments(
    active_only: bool = True,
    period_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    base = select(VMAssignment).where(VMAssignment.deleted_at.is_(None))
    if period_id:
        base = base.where(VMAssignment.period_id == period_id)
    elif active_only:
        base = base.where(VMAssignment.released_at.is_(None))

    count_query = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_query)).scalar() or 0

    query = base.options(
        selectinload(VMAssignment.vm), selectinload(VMAssignment.student)
    ).order_by(VMAssignment.assigned_at.desc()).offset(offset).limit(limit)
    result = await session.execute(query)
    return {"items": result.scalars().all(), "total": total, "limit": limit, "offset": offset}


@router.get("/periods")
async def list_periods(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    query = select(
        Period.id,
        Period.code,
        Period.name,
        Period.start_date,
        Period.end_date,
        Period.is_active,
        Period.closed_at,
        func.count(VMAssignment.id).label("total"),
        func.sum(case((VMAssignment.released_at.is_(None), 1), else_=0)).label("active"),
        func.count(func.distinct(VMAssignment.student_id)).label("student_count"),
    ).outerjoin(
        VMAssignment, VMAssignment.period_id == Period.id
    ).group_by(
        Period.id
    ).order_by(
        Period.code.desc()
    )

    result = await session.execute(query)
    items = [
        {
            "id": row.id,
            "period_name": row.code,
            "name": row.name,
            "start_date": row.start_date.isoformat(),
            "end_date": row.end_date.isoformat(),
            "total": row.total or 0,
            "active": row.active or 0,
            "released": (row.total or 0) - (row.active or 0),
            "student_count": row.student_count or 0,
            "is_active": row.is_active,
            "closed_at": row.closed_at.isoformat() if row.closed_at else None,
        }
        for row in result
    ]
    return {"items": items, "total": len(items)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: AssignmentCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    vm = None
    if body.vm_id:
        vm = await session.get(VirtualMachine, body.vm_id)
        if not vm or vm.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="VM no encontrada",
            )

    student = await session.get(Student, body.student_id)
    if not student or student.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estudiante no encontrado",
        )

    period = await session.get(Period, body.period_id)
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Per\u00edodo no encontrado",
        )

    active_student = await session.execute(
        select(VMAssignment).where(
            and_(
                VMAssignment.student_id == body.student_id,
                VMAssignment.released_at.is_(None),
            )
        )
    )
    if active_student.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Estudiante ya tiene asignaci\u00f3n activa",
        )

    if body.vm_id:
        active_vm = await session.execute(
            select(VMAssignment).where(
                and_(
                    VMAssignment.vm_id == body.vm_id,
                    VMAssignment.released_at.is_(None),
                )
            )
        )
        if active_vm.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="VM ya est\u00e1 asignada",
            )

    assignment = VMAssignment(
        vm_id=body.vm_id,
        student_id=body.student_id,
        period_id=body.period_id,
        vm_name_snapshot=vm.name if vm else None,
        assigned_by=user.id,
        notes=body.notes,
    )
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)
    await log_event(
        session, "assignment_create", user.username,
        f"Asign\u00f3 {vm.name if vm else 'VM#' + str(body.vm_id)} a {student.full_name} ({period.code})",
        "assignment", assignment.id, ip_address=_ip(request),
    )
    return assignment


@router.post("/{assignment_id}/release")
async def release_assignment(
    assignment_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assignment = await session.get(VMAssignment, assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asignaci\u00f3n no encontrada",
        )
    if assignment.released_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Asignaci\u00f3n ya liberada",
        )
    vm_id = assignment.vm_id
    assignment.released_at = datetime.now(timezone.utc)
    await session.commit()
    await log_event(
        session, "assignment_release", user.username,
        f"Liber\u00f3 VM#{vm_id} (asignaci\u00f3n #{assignment_id})",
        "assignment", assignment.id, ip_address=_ip(request),
    )
    return {"message": "Asignaci\u00f3n liberada"}


class BulkReleaseRequest(BaseModel):
    ids: list[int]


class AutoAssignRequest(BaseModel):
    period_id: int
    preview: bool = True


class BatchCreateItem(BaseModel):
    vm_id: int
    student_id: int
    period_id: int


class BatchCreateRequest(BaseModel):
    assignments: list[BatchCreateItem]


@router.post("/bulk-release")
async def bulk_release(
    body: BulkReleaseRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not body.ids:
        raise HTTPException(status_code=422, detail="Lista de IDs vac\u00eda")

    result = await session.execute(
        select(VMAssignment).where(
            VMAssignment.id.in_(body.ids),
            VMAssignment.released_at.is_(None),
        )
    )
    assignments = result.scalars().all()
    now = datetime.utcnow()
    for a in assignments:
        a.released_at = now
    await session.commit()
    for a in assignments:
        await log_event(
            session, "assignment_release", user.username,
            f"Liberaci\u00f3n masiva de asignaci\u00f3n #{a.id}",
            "assignment", a.id, ip_address=_ip(request),
        )
    return {"released": len(assignments)}


@router.post("/auto-assign")
async def auto_assign(
    body: AutoAssignRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    period = await session.get(Period, body.period_id)
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Per\u00edodo no encontrado",
        )

    students_result = await session.execute(
        select(Student).where(Student.deleted_at.is_(None))
    )
    students = students_result.scalars().all()

    active_assignments = await session.execute(
        select(VMAssignment).where(VMAssignment.released_at.is_(None))
    )
    active = active_assignments.scalars().all()
    assigned_student_ids = {a.student_id for a in active}
    assigned_vm_ids = {a.vm_id for a in active if a.vm_id is not None}

    unassigned_students = [s for s in students if s.id not in assigned_student_ids]

    vms_result = await session.execute(
        select(VirtualMachine).where(
            VirtualMachine.deleted_at.is_(None),
            VirtualMachine.template_id.is_(None),
            VirtualMachine.name != "vhost-10",
        ).order_by(VirtualMachine.name)
    )
    available_vms = [
        vm for vm in vms_result.scalars().all()
        if vm.id not in assigned_vm_ids
    ]

    created_pairs = list(zip(unassigned_students, available_vms))

    if body.preview:
        return {
            "preview": True,
            "assignments": [
                {"student": s.full_name, "vm": vm.name, "student_id": s.id, "vm_id": vm.id}
                for s, vm in created_pairs
            ],
            "unassigned_students": max(
                0, len(unassigned_students) - len(created_pairs)
            ),
        }

    for student, vm in created_pairs:
        session.add(VMAssignment(
            vm_id=vm.id,
            student_id=student.id,
            period_id=period.id,
            vm_name_snapshot=vm.name,
            assigned_by=user.id,
        ))

    await session.commit()

    result = await session.execute(
        select(VMAssignment)
        .options(selectinload(VMAssignment.vm), selectinload(VMAssignment.student))
        .where(VMAssignment.period_id == period.id)
        .order_by(VMAssignment.id.desc())
        .limit(len(created_pairs))
    )
    new_assignments = list(result.scalars().all())
    new_assignments.reverse()

    created = []
    for a in new_assignments:
        await log_event(
            session, "assignment_create", user.username,
            f"Asignaci\u00f3n autom\u00e1tica: {a.vm.name} \u2192 {a.student.full_name}",
            "assignment", a.id, ip_address=_ip(request),
        )
        created.append({"student": a.student.full_name, "vm": a.vm.name})

    remaining = max(0, len(unassigned_students) - len(created))

    return {
        "created": len(created),
        "assignments": created,
        "unassigned_students": remaining,
    }


@router.post("/batch")
async def batch_create(
    body: BatchCreateRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    created = []
    now = datetime.utcnow()
    for item in body.assignments:
        vm = await session.get(VirtualMachine, item.vm_id)
        student = await session.get(Student, item.student_id)
        if not vm or not student:
            continue
        assignment = VMAssignment(
            vm_id=item.vm_id,
            student_id=item.student_id,
            period_id=item.period_id,
            vm_name_snapshot=vm.name,
            assigned_by=user.id,
        )
        session.add(assignment)
        await session.flush()
        await log_event(
            session, "assignment_create", user.username,
            f"Asignaci\u00f3n manual: {vm.name} \u2192 {student.full_name}",
            "assignment", assignment.id, ip_address=_ip(request),
        )
        created.append({"student": student.full_name, "vm": vm.name})
    await session.commit()
    return {"created": len(created), "assignments": created, "unassigned_students": 0}
