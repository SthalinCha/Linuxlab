import csv
from datetime import datetime, timezone
from io import StringIO
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, case, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import VMAssignment, Period, VirtualMachine
from app.core.rbac import profesor_only
from app.core.operation_lock import operation_lock
from app.core.dates import utc_iso
from app.models import User
from app.services.assignment_service import (
    create_assignment as svc_create,
    release_assignment as svc_release,
    auto_assign as svc_auto_assign,
    batch_create as svc_batch_create,
    bulk_release as svc_bulk_release,
)

router = APIRouter()


class AssignmentCreate(BaseModel):
    vm_id: int | None = None
    student_id: int
    period_id: int
    notes: Optional[str] = None


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


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("")
async def list_assignments(
    active_only: bool = True,
    period_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    base = select(VMAssignment).where(VMAssignment.deleted_at.is_(None))
    base = base.where(VMAssignment.vm.has(owner_id=user.id))
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


@router.get("/export")
async def export_assignments(
    active_only: bool = False,
    period_id: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    base = select(VMAssignment).where(VMAssignment.deleted_at.is_(None))
    base = base.where(VMAssignment.vm.has(owner_id=user.id))
    if period_id:
        base = base.where(VMAssignment.period_id == period_id)
    elif active_only:
        base = base.where(VMAssignment.released_at.is_(None))

    query = base.options(
        selectinload(VMAssignment.vm),
        selectinload(VMAssignment.student),
        selectinload(VMAssignment.period),
    ).order_by(VMAssignment.assigned_at.desc())

    result = await session.execute(query)
    assignments = result.scalars().all()

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Estudiante", "Email", "VM", "IP", "Periodo",
        "Asignado", "Liberado", "Estado VM", "Notas",
    ])

    for a in assignments:
        writer.writerow([
            a.id,
            a.student.full_name if a.student else "",
            a.student.email if a.student else "",
            a.vm.name if a.vm else "",
            a.vm.ip_address if a.vm else "",
            a.period.code if a.period else "",
            a.assigned_at.isoformat() if a.assigned_at else "",
            a.released_at.isoformat() if a.released_at else "",
            a.vm.current_state if a.vm else "",
            a.notes or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=asignaciones.csv"},
    )


@router.get("/periods")
async def list_periods(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
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

    # Scope by VM ownership so each profesor only sees their own assignment stats
    query = query.where(
        (VMAssignment.id.is_(None))
        | (VMAssignment.vm.has(VirtualMachine.owner_id == user.id))
    )

    result = await session.execute(query)
    items = [
        {
            "id": row.id,
            "period_name": row.code,
            "name": row.name,
            "start_date": utc_iso(row.start_date),
            "end_date": utc_iso(row.end_date),
            "total": row.total or 0,
            "active": row.active or 0,
            "released": (row.total or 0) - (row.active or 0),
            "student_count": row.student_count or 0,
            "is_active": row.is_active,
            "closed_at": utc_iso(row.closed_at),
        }
        for row in result
    ]
    return {"items": items, "total": len(items)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: AssignmentCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    return await svc_create(
        session=session,
        vm_id=body.vm_id,
        student_id=body.student_id,
        period_id=body.period_id,
        assigned_by=user.id,
        ip=_ip(request),
        username=user.username,
        notes=body.notes,
        user=user,
    )


@router.post("/{assignment_id}/release")
async def release_assignment(
    assignment_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    return await svc_release(
        session=session,
        assignment_id=assignment_id,
        ip=_ip(request),
        username=user.username,
        user=user,
    )


@router.post("/bulk-release")
async def bulk_release(
    body: BulkReleaseRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    return await svc_bulk_release(
        session=session,
        ids=body.ids,
        ip=_ip(request),
        username=user.username,
        user_id=user.id,
    )


@router.post("/auto-assign")
async def auto_assign(
    body: AutoAssignRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    return await svc_auto_assign(
        session=session,
        period_id=body.period_id,
        preview=body.preview,
        ip=_ip(request),
        username=user.username,
        assigned_by=user.id,
        owner_id=user.id,
        user_id=user.id,
    )


@router.post("/batch")
async def batch_create(
    body: BatchCreateRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    return await svc_batch_create(
        session=session,
        items=body.assignments,
        ip=_ip(request),
        username=user.username,
        assigned_by=user.id,
        user=user,
    )


class BulkDeleteRequest(BaseModel):
    ids: list[int]


@router.delete("/{assignment_id}")
async def delete_assignment(
    assignment_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    assignment = await session.get(VMAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")

    if user.role.name == "profesor":
        if assignment.vm_id:
            vm = await session.get(VirtualMachine, assignment.vm_id)
            if vm and vm.owner_id != user.id:
                raise HTTPException(status_code=403, detail="No tienes permiso para eliminar esta asignación")
        else:
            raise HTTPException(status_code=403, detail="No tienes permiso para eliminar esta asignación")

    await session.delete(assignment)
    await session.commit()

    from app.core.audit import log_event
    await log_event(session, "assignment_delete", user.username,
                    f"Eliminó asignación #{assignment_id}",
                    "assignment", assignment_id, ip_address=_ip(request), user_id=user.id,
                    commit=True)
    return {"message": "Asignación eliminada"}


@router.post("/bulk-delete")
async def bulk_delete(
    body: BulkDeleteRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    if not body.ids:
        raise HTTPException(status_code=422, detail="Lista de IDs vacía")

    lock_key = f"bulk-delete-assignment:{user.id}"
    if not await operation_lock.acquire(lock_key):
        raise HTTPException(status_code=409, detail="Ya hay una eliminación masiva en progreso")
    try:
        from app.core.audit import log_event

        result = await session.execute(
            select(VMAssignment).where(VMAssignment.id.in_(body.ids))
        )
        assignments = result.scalars().all()

        vm_ids = [a.vm_id for a in assignments if a.vm_id is not None]
        own_vm_ids: set[int] = set(vm_ids)
        if vm_ids and user.role.name == "profesor":
            vm_result = await session.execute(
                select(VirtualMachine.id).where(
                    VirtualMachine.id.in_(vm_ids),
                    VirtualMachine.owner_id == user.id,
                )
            )
            own_vm_ids = {row[0] for row in vm_result.all()}

        deleted = 0
        for assignment in assignments:
            if user.role.name == "profesor":
                if not assignment.vm_id:
                    continue
                if assignment.vm_id not in own_vm_ids:
                    continue
            await session.delete(assignment)
            deleted += 1
            await log_event(session, "assignment_delete", user.username,
                            f"Eliminó asignación #{assignment.id} (masivo)",
                            "assignment", assignment.id, ip_address=_ip(request), user_id=user.id)

        await session.commit()
        return {"deleted": deleted}
    finally:
        operation_lock.release(lock_key)
