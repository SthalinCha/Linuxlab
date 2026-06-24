from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import VMAssignment, Student, VirtualMachine, Period, AuditLog, User
from app.core.audit import log_event
from app.services.config_service import get_cached_str


async def _validate_assignment(
    session: AsyncSession,
    vm_id: int | None,
    student_id: int,
    period_id: int,
    user: User | None = None,
) -> tuple:
    """Validate assignment rules and return (vm, student, period).

    Raises HTTPException on any violation.
    All existence/per-period checks are scoped to the given period_id.
    """
    from fastapi import HTTPException, status

    vm = None
    if vm_id is not None:
        if vm_id <= 0:
            raise HTTPException(status_code=422, detail="vm_id debe ser > 0 o null")
        vm = await session.get(VirtualMachine, vm_id)
        if not vm or vm.deleted_at is not None:
            raise HTTPException(status_code=404, detail="VM no encontrada")
        if vm.current_state not in ('running', 'shut off'):
            raise HTTPException(
                status_code=422,
                detail=f"VM en estado '{vm.current_state}' no es asignable",
            )
        if user and user.role.name == "profesor" and vm.owner_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="No tienes permiso para asignar esta VM",
            )

    student = await session.get(Student, student_id)
    if not student or student.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")

    period = await session.get(Period, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    if period.closed_at is not None:
        raise HTTPException(status_code=422, detail="El período ya está cerrado")

    # Per-period check: student must not have an active assignment IN THIS PERIOD
    active_student = await session.execute(
        select(VMAssignment).where(
            and_(
                VMAssignment.student_id == student_id,
                VMAssignment.period_id == period_id,
                VMAssignment.released_at.is_(None),
            )
        )
    )
    if active_student.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="El estudiante ya tiene una asignación activa en este período",
        )

    # Per-period check: VM must not have an active assignment IN THIS PERIOD
    has_vm = vm_id is not None and vm_id > 0
    if has_vm:
        active_vm = await session.execute(
            select(VMAssignment).where(
                and_(
                    VMAssignment.vm_id == vm_id,
                    VMAssignment.period_id == period_id,
                    VMAssignment.released_at.is_(None),
                )
            )
        )
        if active_vm.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="La VM ya está asignada en este período",
            )

    return vm, student, period


async def create_assignment(
    session: AsyncSession,
    vm_id: int | None,
    student_id: int,
    period_id: int,
    assigned_by: int,
    ip: str,
    username: str,
    notes: Optional[str] = None,
    user: User | None = None,
) -> VMAssignment:
    vm, student, period = await _validate_assignment(
        session, vm_id, student_id, period_id, user=user,
    )

    has_vm = vm_id is not None and vm_id > 0
    assignment = VMAssignment(
        vm_id=vm_id if has_vm else None,
        student_id=student_id,
        period_id=period_id,
        vm_name_snapshot=vm.name if has_vm and vm else None,
        assigned_by=assigned_by,
        notes=notes,
    )
    session.add(assignment)
    await session.flush()
    await session.refresh(assignment)

    vm_label = vm.name if has_vm and vm else f"VM#{vm_id}"
    await log_event(
        session, "assignment_create", username,
        f"Asignó {vm_label} a {student.full_name} ({period.code})",
        "assignment", assignment.id, ip_address=ip,
        user_id=user.id if user else None,
    )
    return assignment


async def release_assignment(
    session: AsyncSession,
    assignment_id: int,
    ip: str,
    username: str,
    user: User | None = None,
) -> dict:
    from fastapi import HTTPException, status

    assignment = await session.get(VMAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    if assignment.released_at:
        raise HTTPException(status_code=409, detail="Asignación ya liberada")

    if user and user.role.name == "profesor":
        if assignment.vm_id:
            vm = await session.get(VirtualMachine, assignment.vm_id)
            if vm and vm.owner_id != user.id:
                raise HTTPException(
                    status_code=403,
                    detail="No tienes permiso para liberar esta asignación",
                )

    vm_id = assignment.vm_id
    assignment.released_at = datetime.now(timezone.utc)
    await session.flush()
    await log_event(
        session, "assignment_release", username,
        f"Liberó VM#{vm_id} (asignación #{assignment_id})",
        "assignment", assignment.id, ip_address=ip,
        user_id=user.id if user else None,
    )
    return {"message": "Asignación liberada"}


async def _find_unassigned_students(
    session: AsyncSession,
    period_id: int,
    student_ids: set[int] | None = None,
    created_by: int | None = None,
) -> list[Student]:
    """Find students without an active assignment in the given period."""
    query = select(Student).where(
        Student.deleted_at.is_(None),
        ~Student.id.in_(
            select(VMAssignment.student_id).where(
                VMAssignment.period_id == period_id,
                VMAssignment.released_at.is_(None),
            )
        ),
    )
    if created_by is not None:
        query = query.where(Student.created_by == created_by)
    if student_ids is not None:
        query = query.where(Student.id.in_(student_ids))
    query = query.order_by(Student.full_name)
    result = await session.execute(query)
    return list(result.scalars().all())


async def _find_available_vms(
    session: AsyncSession,
    period_id: int,
    owner_id: int | None = None,
) -> list[VirtualMachine]:
    """Find VMs without an active assignment in the given period."""
    query = select(VirtualMachine).where(
        VirtualMachine.deleted_at.is_(None),
        VirtualMachine.template_id.is_(None),
        VirtualMachine.name != get_cached_str("teacher_vm_name", "vhost-10"),
        ~VirtualMachine.id.in_(
            select(VMAssignment.vm_id).where(
                VMAssignment.period_id == period_id,
                VMAssignment.released_at.is_(None),
                VMAssignment.vm_id.isnot(None),
            )
        ),
    )
    if owner_id is not None:
        query = query.where(VirtualMachine.owner_id == owner_id)
    query = query.order_by(VirtualMachine.name)
    result = await session.execute(query)
    return list(result.scalars().all())


async def auto_assign(
    session: AsyncSession,
    period_id: int,
    preview: bool,
    ip: str,
    username: str,
    assigned_by: int,
    owner_id: int | None = None,
    user_id: int | None = None,
) -> dict:
    from fastapi import HTTPException

    period = await session.get(Period, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    unassigned = await _find_unassigned_students(
        session, period_id, created_by=owner_id,
    )
    available = await _find_available_vms(session, period_id, owner_id=owner_id)

    pairs = list(zip(unassigned, available))

    if preview:
        return {
            "preview": True,
            "assignments": [
                {"student": s.full_name, "vm": vm.name, "student_id": s.id, "vm_id": vm.id}
                for s, vm in pairs
            ],
            "unassigned_students": max(0, len(unassigned) - len(pairs)),
            "available_vms": len(available),
            "total_unassigned": len(unassigned),
        }

    assignment_objs = []
    for student, vm in pairs:
        a = VMAssignment(
            vm_id=vm.id,
            student_id=student.id,
            period_id=period.id,
            vm_name_snapshot=vm.name,
            assigned_by=assigned_by,
        )
        session.add(a)
        assignment_objs.append((a, student, vm))

    await session.flush()

    created = []
    for a, student, vm in assignment_objs:
        await log_event(
            session, "assignment_create", username,
            f"Asignación automática: {vm.name} → {student.full_name}",
            "assignment", a.id, ip_address=ip, user_id=user_id,
        )
        created.append({"student": student.full_name, "vm": vm.name})

    remaining = max(0, len(unassigned) - len(created))
    return {
        "created": len(created),
        "assignments": created,
        "unassigned_students": remaining,
    }


async def batch_create(
    session: AsyncSession,
    items: list,
    ip: str,
    username: str,
    assigned_by: int,
    user: User | None = None,
) -> dict:
    created = []
    errors = []
    for item in items:
        vm = await session.get(VirtualMachine, item.vm_id)
        student = await session.get(Student, item.student_id)
        if not vm or not student:
            errors.append({
                "vm_id": item.vm_id,
                "student_id": item.student_id,
                "reason": "VM o estudiante no encontrado",
                "vm_found": vm is not None,
                "student_found": student is not None,
            })
            continue
        if user and user.role.name == "profesor":
            if vm.owner_id != user.id:
                errors.append({"vm_id": item.vm_id, "student_id": item.student_id, "reason": "No tienes permiso para esta VM"})
                continue
            if student.created_by != user.id:
                errors.append({"vm_id": item.vm_id, "student_id": item.student_id, "reason": "No tienes permiso para este estudiante"})
                continue
        assignment = VMAssignment(
            vm_id=item.vm_id,
            student_id=item.student_id,
            period_id=item.period_id,
            vm_name_snapshot=vm.name,
            assigned_by=assigned_by,
        )
        session.add(assignment)
        await session.flush()
        await log_event(
            session, "assignment_create", username,
            f"Asignación manual: {vm.name} → {student.full_name}",
            "assignment", assignment.id, ip_address=ip,
            user_id=user.id if user else None,
        )
        created.append({"student": student.full_name, "vm": vm.name})
    return {"created": len(created), "assignments": created, "errors": errors, "unassigned_students": 0}


async def bulk_release(
    session: AsyncSession,
    ids: list[int],
    ip: str,
    username: str,
    user_id: int,
) -> dict:
    from fastapi import HTTPException

    if not ids:
        raise HTTPException(status_code=422, detail="Lista de IDs vacía")

    result = await session.execute(
        select(VMAssignment).where(
            VMAssignment.id.in_(ids),
            VMAssignment.released_at.is_(None),
            VMAssignment.vm.has(VirtualMachine.owner_id == user_id),
        )
    )
    assignments = result.scalars().all()
    now = datetime.now(timezone.utc)
    for a in assignments:
        a.released_at = now
        session.add(AuditLog(
            event_type="assignment_release",
            admin_username=username,
            user_id=user_id,
            action=f"Liberación masiva de asignación #{a.id}",
            resource_type="assignment",
            resource_id=a.id,
            ip_address=ip,
        ))
    await session.commit()
    return {"released": len(assignments)}


async def close_period(
    session: AsyncSession,
    period_id: int,
    ip: str,
    username: str,
    user_id: int | None = None,
) -> dict:
    from fastapi import HTTPException

    period = await session.get(Period, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    # Soft-release only the current user's active assignments
    query = select(VMAssignment).where(
        VMAssignment.period_id == period_id,
        VMAssignment.released_at.is_(None),
    )
    if user_id is not None:
        query = query.where(VMAssignment.vm.has(VirtualMachine.owner_id == user_id))
    result = await session.execute(query)
    active = result.scalars().all()
    now = datetime.now(timezone.utc)
    for a in active:
        a.released_at = now

    period.is_active = False
    period.closed_at = now
    await session.commit()

    await log_event(
        session, "period_close", username,
        f"Finalizó período {period.code} ({len(active)} asignaciones liberadas)",
        "period", period.id, ip_address=ip,
        details={"released_count": len(active)},
        user_id=user_id,
    )

    return {
        "message": f"Período {period.code} finalizado",
        "released_count": len(active),
    }
