from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, and_, func, case
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.database.models import VMAssignment, Student, VirtualMachine
from app.core.security import get_current_admin
from app.database.models import Admin
from app.core.audit import log_event

router = APIRouter()


class AssignmentCreate(BaseModel):
    id_vm: int
    id_student: int
    period_name: str
    notes: Optional[str] = None


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("")
async def list_assignments(
    active_only: bool = True,
    period: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    query = select(VMAssignment).options(
        selectinload(VMAssignment.vm), selectinload(VMAssignment.student)
    )
    if period:
        query = query.where(VMAssignment.period_name == period)
    elif active_only:
        query = query.where(VMAssignment.released_at.is_(None))
    query = query.order_by(VMAssignment.assigned_at.desc())
    result = await session.execute(query)
    return result.scalars().all()


@router.get("/periods")
async def list_periods(
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    query = select(
        VMAssignment.period_name,
        func.count().label("total"),
        func.sum(case((VMAssignment.released_at.is_(None), 1), else_=0)).label("active"),
        func.sum(case((VMAssignment.released_at.isnot(None), 1), else_=0)).label("released"),
    ).group_by(VMAssignment.period_name).order_by(VMAssignment.period_name.desc())
    result = await session.execute(query)
    return [
        {
            "period_name": row[0],
            "total": row[1],
            "active": row[2] if row[2] else 0,
            "released": row[3] if row[3] else 0,
        }
        for row in result
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: AssignmentCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    vm = await session.get(VirtualMachine, body.id_vm)
    if not vm or not vm.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    student = await session.get(Student, body.id_student)
    if not student or not student.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")

    active_student = await session.execute(
        select(VMAssignment).where(
            and_(VMAssignment.id_student == body.id_student, VMAssignment.released_at.is_(None))
        )
    )
    if active_student.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Estudiante ya tiene asignación activa")

    active_vm = await session.execute(
        select(VMAssignment).where(
            and_(VMAssignment.id_vm == body.id_vm, VMAssignment.released_at.is_(None))
        )
    )
    if active_vm.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="VM ya está asignada")

    assignment = VMAssignment(**body.model_dump())
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)
    await log_event(session, "assignment_create", admin.username,
                    f"Asignó {vm.name} a {student.full_name} ({body.period_name})",
                    "assignment", assignment.id, ip_address=_ip(request))
    return assignment


@router.post("/{assignment_id}/release")
async def release_assignment(
    assignment_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    assignment = await session.get(VMAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asignación no encontrada")
    if assignment.released_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Asignación ya liberada")
    vm_id = assignment.id_vm
    assignment.released_at = datetime.utcnow()
    await session.commit()
    await log_event(session, "assignment_release", admin.username,
                    f"Liberó VM#{vm_id} (asignación #{assignment_id})",
                    "assignment", assignment.id, ip_address=_ip(request))
    return {"message": "Asignación liberada"}


class BulkReleaseRequest(BaseModel):
    ids: list[int]


class AutoAssignRequest(BaseModel):
    period_name: str


@router.post("/bulk-release")
async def bulk_release(
    body: BulkReleaseRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    if not body.ids:
        raise HTTPException(status_code=422, detail="Lista de IDs vacía")

    result = await session.execute(
        select(VMAssignment).where(
            VMAssignment.id.in_(body.ids),
            VMAssignment.released_at.is_(None)
        )
    )
    assignments = result.scalars().all()
    now = datetime.utcnow()
    for a in assignments:
        a.released_at = now
    await session.commit()
    for a in assignments:
        await log_event(session, "assignment_release", admin.username,
                        f"Liberación masiva de asignación #{a.id}",
                        "assignment", a.id, ip_address=_ip(request))
    return {"released": len(assignments)}


@router.post("/auto-assign")
async def auto_assign(
    body: AutoAssignRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    students_result = await session.execute(
        select(Student).where(Student.is_active == True)
    )
    students = students_result.scalars().all()

    active_assignments = await session.execute(
        select(VMAssignment).where(VMAssignment.released_at.is_(None))
    )
    active = active_assignments.scalars().all()
    assigned_student_ids = {a.id_student for a in active}
    assigned_vm_ids = {a.id_vm for a in active}

    unassigned_students = [s for s in students if s.id not in assigned_student_ids]

    vms_result = await session.execute(
        select(VirtualMachine).where(
            VirtualMachine.is_active == True,
            VirtualMachine.name != "vhost-10",
        ).order_by(VirtualMachine.name)
    )
    available_vms = [vm for vm in vms_result.scalars().all() if vm.id not in assigned_vm_ids]

    created_pairs = list(zip(unassigned_students, available_vms))
    for student, vm in created_pairs:
        session.add(VMAssignment(
            id_vm=vm.id,
            id_student=student.id,
            period_name=body.period_name,
        ))

    await session.commit()

    result = await session.execute(
        select(VMAssignment)
        .options(selectinload(VMAssignment.vm), selectinload(VMAssignment.student))
        .where(VMAssignment.period_name == body.period_name)
        .order_by(VMAssignment.id.desc())
        .limit(len(created_pairs))
    )
    new_assignments = list(result.scalars().all())
    new_assignments.reverse()

    created = []
    for a in new_assignments:
        await log_event(session, "assignment_create", admin.username,
                        f"Asignación automática: {a.vm.name} → {a.student.full_name}",
                        "assignment", a.id, ip_address=_ip(request))
        created.append({"student": a.student.full_name, "vm": a.vm.name})

    remaining = max(0, len(unassigned_students) - len(created))

    return {
        "created": len(created),
        "assignments": created,
        "unassigned_students": remaining,
    }
