import csv
from datetime import datetime, timezone
from io import StringIO
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, case
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import VMAssignment, Period
from app.core.security import get_current_user
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


@router.get("/export")
async def export_assignments(
    active_only: bool = False,
    period_id: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    base = select(VMAssignment).where(VMAssignment.deleted_at.is_(None))
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
    return await svc_create(
        session=session,
        vm_id=body.vm_id,
        student_id=body.student_id,
        period_id=body.period_id,
        assigned_by=user.id,
        ip=_ip(request),
        username=user.username,
        notes=body.notes,
    )


@router.post("/{assignment_id}/release")
async def release_assignment(
    assignment_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return await svc_release(
        session=session,
        assignment_id=assignment_id,
        ip=_ip(request),
        username=user.username,
    )


@router.post("/bulk-release")
async def bulk_release(
    body: BulkReleaseRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
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
    user: User = Depends(get_current_user),
):
    return await svc_auto_assign(
        session=session,
        period_id=body.period_id,
        preview=body.preview,
        ip=_ip(request),
        username=user.username,
        assigned_by=user.id,
    )


@router.post("/batch")
async def batch_create(
    body: BatchCreateRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return await svc_batch_create(
        session=session,
        items=body.assignments,
        ip=_ip(request),
        username=user.username,
        assigned_by=user.id,
    )
