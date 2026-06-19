import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import VirtualMachine, VMAssignment
from app.core.security import get_current_user
from app.models import User
from app.core.libvirt.vm_manager import VMManager
from app.services.clone_service import CloneService, mac_from_num
from app.services.vm_service import build_ports
from app.services.iptables_service import forward_port, unforward_port, forward_range, unforward_range
from app.core.config import VM_SUBNET
from app.core.audit import log_event
from app.services.vm_list_service import list_vms as list_vms_service
from app.services.vm_bulk_service import delete_vm_by_id, bulk_delete_vms, bulk_action_vms
from app.services.vm_port_service import add_port_to_vm, remove_port_from_vm, bulk_add_ports_to_vm
from app.schemas.virtual_machine import (
    VirtualMachineResponse,
    CloneRequest, CloneRangeRequest, CreateLabRequest,
    BulkDeleteRequest, AddPortRequest, BulkPortsRequest, BulkActionRequest, RecreateRangeRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()
vm_manager = VMManager()
clone_service = CloneService()


def _ip_from_request(request: Request) -> str:
    return request.client.host if request.client else ""


async def _auto_iptables(num: int):
    try:
        await asyncio.to_thread(forward_range, num, num)
    except Exception as e:
        logger.warning("Error configurando iptables para VM %s: %s", num, e)


async def _auto_uniptables(num: int):
    try:
        await asyncio.to_thread(unforward_range, num, num)
    except Exception as e:
        logger.warning("Error eliminando iptables para VM %s: %s", num, e)


async def _create_single_vm(
    session: AsyncSession,
    clone_service,
    num: int,
    *,
    template_name: str | None = None,
    vcpus: int | None = None,
    ram_mb: int | None = None,
    disk_gb: int = 10,
    prefix: str = "vhost",
    username: str = "",
    ip_address: str = "",
) -> dict:
    from sqlalchemy.exc import IntegrityError
    name = f"{prefix}-{num}"
    mac = mac_from_num(num)

    existing = await session.execute(
        select(VirtualMachine).where(VirtualMachine.name == name)
    )
    existing_vm = existing.scalar_one_or_none()
    if existing_vm and existing_vm.deleted_at is None:
        return {"vm": None, "status": "skipped", "reason": "ya existe", "name": name, "number": num}

    tpl = template_name or "ubuntu-server-main"
    r = await asyncio.to_thread(
        clone_service.clone_vm,
        source_name=tpl,
        new_name=name,
        new_mac=mac,
        memory_mb=ram_mb or 4096,
        vcpus=vcpus or 1,
    )
    if not r["success"]:
        return {"vm": None, "status": "error", "reason": r["error"], "name": name, "number": num}

    if existing_vm:
        existing_vm.template_name = tpl
        existing_vm.mac_address = mac
        existing_vm.ip_address = f"{VM_SUBNET}.{num}"
        existing_vm.vcpus = vcpus or 1
        existing_vm.ram_mb = ram_mb or 4096
        existing_vm.disk_gb = disk_gb
        existing_vm.current_state = "shut off"
        existing_vm.ports = build_ports(num)
        existing_vm.deleted_at = None
        vm = existing_vm
        await session.commit()
        await session.refresh(vm)
    else:
        vm = VirtualMachine(
            name=name, template_name=tpl, mac_address=mac,
            ip_address=f"{VM_SUBNET}.{num}",
            vcpus=vcpus or 1, ram_mb=ram_mb or 4096,
            disk_gb=disk_gb, current_state="shut off",
            ports=build_ports(num),
        )
        session.add(vm)
        try:
            await session.commit()
            await session.refresh(vm)
        except IntegrityError:
            await session.rollback()
            return {"vm": None, "status": "error", "reason": "conflicto de integridad", "name": name, "number": num}

    await _auto_iptables(num)
    await log_event(session, "vm_clone", username,
                    f"Creó VM {name} desde plantilla",
                    "vm", vm.id, ip_address=ip_address)
    return {"vm": vm, "status": "created", "reason": None, "name": name, "number": num}


@router.get("")
async def list_vms(
    state: Optional[str] = None,
    include_templates: bool = False,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return await list_vms_service(session, vm_manager, state, include_templates, limit, offset)


@router.get("/light")
async def list_vms_light(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(VirtualMachine).where(
            VirtualMachine.deleted_at.is_(None),
            VirtualMachine.template_id.is_(None),
        ).order_by(VirtualMachine.name)
    )
    vms = result.scalars().all()
    return {"items": vms}


@router.get("/{vm_id}", response_model=VirtualMachineResponse)
async def get_vm(
    vm_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    domain = await asyncio.to_thread(vm_manager.get_domain, vm.name)
    if domain:
        vm.current_state = domain["state"]
        vm.ram_used_mb = domain.get("ram_used_mb")
        vm.ram_percent = domain.get("ram_percent")
    return vm


@router.post("/{vm_id}/start")
async def start_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    ok = await asyncio.to_thread(vm_manager.start, vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al iniciar VM")
    vm.current_state = "running"
    await session.commit()
    await log_event(session, "vm_start", user.username, f"Inició VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} encendida"}


@router.post("/{vm_id}/shutdown")
async def shutdown_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    ok = await asyncio.to_thread(vm_manager.shutdown, vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al apagar VM")
    vm.current_state = "shut off"
    await session.commit()
    await log_event(session, "vm_shutdown", user.username, f"Apagó VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} apagada"}


@router.post("/{vm_id}/reboot")
async def reboot_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    ok = await asyncio.to_thread(vm_manager.reboot, vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al reiniciar VM")
    await log_event(session, "vm_reboot", user.username, f"Reinició VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} reiniciando"}


@router.post("/{vm_id}/destroy")
async def destroy_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    ok = await asyncio.to_thread(vm_manager.destroy, vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al forzar apagado")
    vm.current_state = "shut off"
    await session.commit()
    await log_event(session, "vm_destroy", user.username, f"Forzó apagado de VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} forzada a apagar"}


@router.post("/clone", response_model=VirtualMachineResponse)
async def clone_vm(
    body: CloneRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    r = await _create_single_vm(
        session, clone_service, body.number,
        template_name=body.template_name,
        vcpus=body.vcpus,
        ram_mb=body.ram_mb,
        username=user.username,
        ip_address=_ip_from_request(request),
    )
    if r["status"] == "skipped":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"VM {r['name']} ya existe")
    if r["status"] == "error":
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=r["reason"])
    return r["vm"]


@router.post("/clone-range")
async def clone_vm_range(
    body: CloneRangeRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if body.from_number < 1 or body.to_number > 254 or body.from_number > body.to_number:
        raise HTTPException(status_code=422, detail="Rango inválido (1-254, from <= to)")

    results = []
    for num in range(body.from_number, body.to_number + 1):
        r = await _create_single_vm(
            session, clone_service, num,
            template_name=body.template_name,
            vcpus=body.vcpus,
            ram_mb=body.ram_mb,
            username=user.username,
            ip_address=_ip_from_request(request),
        )
        results.append({"number": num, "name": r["name"], "status": r["status"], "reason": r["reason"]})

    return results


@router.post("/create-lab")
async def create_lab(
    body: CreateLabRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if body.count < 1 or body.count > 50:
        raise HTTPException(status_code=422, detail="Cantidad inválida (1-50)")
    if body.start_number < 1 or body.start_number > 254:
        raise HTTPException(status_code=422, detail="Número inicial inválido")

    results = []
    for i in range(body.count):
        num = body.start_number + i
        r = await _create_single_vm(
            session, clone_service, num,
            template_name=body.template_name,
            vcpus=body.vcpus,
            ram_mb=body.ram_mb,
            prefix=body.prefix,
            username=user.username,
            ip_address=_ip_from_request(request),
        )
        results.append({"number": num, "name": r["name"], "status": r["status"], "reason": r["reason"]})

    return results


@router.post("/{vm_id}/recreate")
async def recreate_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")

    assignment_active = await session.execute(
        select(VMAssignment).where(
            VMAssignment.vm_id == vm_id, VMAssignment.released_at.is_(None)
        )
    )
    assignment = assignment_active.scalar_one_or_none()
    if assignment and assignment.recreation_count >= 3:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Límite de 3 recreaciones alcanzado")

    r = await asyncio.to_thread(
        clone_service.recreate_vm,
        vm.name,
        template_name=vm.template_name or "ubuntu-server-main",
        mac_address=vm.mac_address,
        memory_mb=vm.ram_mb or 4096,
        vcpus=vm.vcpus or 1,
    )
    if not r["success"]:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=r["error"])

    if assignment:
        assignment.recreate(user.id, note="Recreación desde API")
    vm.current_state = "shut off"
    try:
        num = int(vm.name.split("-")[-1])
        vm.ports = build_ports(num)
    except (ValueError, IndexError):
        pass
    await session.commit()
    await log_event(session, "vm_recreate", user.username, f"Recreó VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} recreada", "recreation_count": assignment.recreation_count if assignment else 0}


@router.post("/recreate-range")
async def recreate_vm_range(
    body: RecreateRangeRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if body.from_number < 1 or body.to_number > 254 or body.from_number > body.to_number:
        raise HTTPException(status_code=422, detail="Rango inválido (1-254, from <= to)")

    results = []
    for num in range(body.from_number, body.to_number + 1):
        name = f"vhost-{num}"
        result = await session.execute(
            select(VirtualMachine).where(VirtualMachine.name == name, VirtualMachine.deleted_at.is_(None))
        )
        vm = result.scalar_one_or_none()
        if not vm:
            results.append({"number": num, "name": name, "status": "not_found"})
            continue

        r = await asyncio.to_thread(clone_service.recreate_vm, vm.name, template_name=vm.template_name or "ubuntu-server-main")
        if not r["success"]:
            results.append({"number": num, "name": name, "status": "error", "reason": r["error"]})
            continue

        vm.current_state = "shut off"
        try:
            vm.ports = build_ports(num)
        except (ValueError, IndexError):
            pass
        await session.commit()
        await log_event(session, "vm_recreate", user.username,
                        f"Recreó {vm.name} (rango)",
                        "vm", vm.id, ip_address=_ip_from_request(request))
        results.append({"number": num, "name": name, "status": "recreated"})

    return results


@router.delete("/{vm_id}")
async def delete_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await delete_vm_by_id(session, vm_id, vm_manager, clone_service,
                                   user.username, _ip_from_request(request))
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    return result


@router.post("/bulk-delete")
async def bulk_delete(
    body: BulkDeleteRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not body.ids:
        raise HTTPException(status_code=422, detail="Lista de IDs vacía")
    return await bulk_delete_vms(session, body.ids, vm_manager, clone_service,
                                 user.username, _ip_from_request(request))


@router.post("/bulk-action")
async def bulk_action(
    body: BulkActionRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not body.ids:
        raise HTTPException(status_code=422, detail="Lista de IDs vacía")
    action_map = {"start", "shutdown", "reboot", "destroy"}
    if body.action not in action_map:
        raise HTTPException(status_code=422, detail=f"Acción '{body.action}' no válida")
    return await bulk_action_vms(session, body.ids, body.action, vm_manager,
                                 user.username, _ip_from_request(request))


@router.post("/{vm_id}/ports", response_model=VirtualMachineResponse)
async def add_port(
    vm_id: int,
    body: AddPortRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await add_port_to_vm(session, vm_id, body.service, body.port,
                                  user.username, _ip_from_request(request))
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    return result


@router.delete("/{vm_id}/ports/{port_index}", response_model=VirtualMachineResponse)
async def remove_port(
    vm_id: int,
    port_index: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await remove_port_from_vm(session, vm_id, port_index,
                                       user.username, _ip_from_request(request))
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM o puerto no encontrado")
    return result


@router.post("/bulk-ports", response_model=VirtualMachineResponse)
async def bulk_ports(
    body: BulkPortsRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await bulk_add_ports_to_vm(session, body.vm_id, [p.model_dump() for p in body.ports],
                                        user.username, _ip_from_request(request))
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    return result
