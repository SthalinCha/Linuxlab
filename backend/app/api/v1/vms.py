import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session, async_session
from app.models import VirtualMachine, VMAssignment, VMTemplate
from app.core.security import get_current_user
from app.models import User
from app.core.libvirt.vm_manager import get_manager as get_vm_manager
from app.services.clone_service import CloneService, mac_from_num, _customize_guest
from app.services.vm_service import build_ports
from app.services.iptables_service import forward_port, unforward_port, forward_range, unforward_range
from app.core.config import VM_SUBNET
from app.services.config_service import get_cached_int, get_cached_str
from app.core.audit import log_event
from app.services.vm_list_service import list_vms as list_vms_service
from app.services.sync_vms import sync_libvirt_domains
from app.services.vm_bulk_service import delete_vm_by_id, bulk_delete_vms, bulk_action_vms
from app.services.vm_port_service import add_port_to_vm, remove_port_from_vm, bulk_add_ports_to_vm
from sqlalchemy.orm import selectinload
from app.schemas.virtual_machine import (
    VirtualMachineResponse,
    CloneRequest, CloneRangeRequest, CreateLabRequest,
    BulkDeleteRequest, AddPortRequest, BulkPortsRequest, BulkActionRequest, RecreateRangeRequest,
    NextNumberResponse,
)
from app.schemas.vm_template import VMTemplateResponse

logger = logging.getLogger(__name__)

router = APIRouter()
vm_manager = get_vm_manager()
clone_service = CloneService()

_clone_semaphore = asyncio.Semaphore(3)


async def _clone_vm_task(
    num: int, *,
    template_name: str | None = None,
    vcpus: int | None = None,
    ram_mb: int | None = None,
    disk_gb: int | None = None,
    prefix: str = "vhost",
    username: str = "",
    ip_address: str = "",
    owner_id: int | None = None,
) -> dict:
    async with _clone_semaphore:
        async with async_session() as task_session:
            r = await _create_single_vm(
                task_session, clone_service, num,
                template_name=template_name, vcpus=vcpus, ram_mb=ram_mb, disk_gb=disk_gb,
                prefix=prefix, username=username, ip_address=ip_address, owner_id=owner_id,
            )
    return {"number": num, "name": r["name"], "status": r["status"], "reason": r["reason"]}


def _ip_from_request(request: Request) -> str:
    return request.client.host if request.client else ""


async def _get_vm_or_404(session: AsyncSession, vm_id: int, user: User) -> VirtualMachine:
    result = await session.execute(
        select(VirtualMachine)
        .options(selectinload(VirtualMachine.owner))
        .where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    if user.role.name == "profesor" and vm.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para esta VM")
    return vm


async def _auto_iptables(num: int):
    try:
        await forward_range(num, num)
    except Exception as e:
        logger.warning("Error configurando iptables para VM %s: %s", num, e)


async def _auto_uniptables(num: int):
    try:
        await unforward_range(num, num)
    except Exception as e:
        logger.warning("Error eliminando iptables para VM %s: %s", num, e)


async def _get_next_vm_number(session: AsyncSession) -> int:
    from sqlalchemy import func, cast, Integer
    result = await session.execute(
        select(func.max(
            cast(func.substring_index(VirtualMachine.name, '-', -1), Integer)
        )).where(
            VirtualMachine.name.like("vhost-%"),
            VirtualMachine.deleted_at.is_(None),
        )
    )
    max_num = result.scalar()
    return max_num + 1 if max_num else 10


async def _create_single_vm(
    session: AsyncSession,
    clone_service,
    num: int,
    *,
    template_name: str | None = None,
    vcpus: int | None = None,
    ram_mb: int | None = None,
    disk_gb: int | None = None,
    prefix: str = "vhost",
    username: str = "",
    ip_address: str = "",
    owner_id: int | None = None,
) -> dict:
    from sqlalchemy.exc import IntegrityError
    _default_ram = get_cached_int("default_vm_ram_mb", 4096)
    _default_vcpus = get_cached_int("default_vm_vcpus", 1)
    _default_disk = get_cached_int("default_vm_disk_gb", 10)
    _default_template = get_cached_str("default_template", "ubuntu-server-main")

    ram_mb = ram_mb or _default_ram
    vcpus = vcpus or _default_vcpus
    _req_disk = disk_gb
    tpl = template_name or _default_template
    name = f"{prefix}-{num}"
    mac = mac_from_num(num)

    existing = await session.execute(
        select(VirtualMachine).where(VirtualMachine.name == name)
    )
    existing_vm = existing.scalar_one_or_none()
    if existing_vm and existing_vm.deleted_at is None:
        return {"vm": None, "status": "skipped", "reason": "ya existe", "name": name, "number": num}

    r = await clone_service.clone_vm(
        source_name=tpl,
        new_name=name,
        new_mac=mac,
        memory_mb=ram_mb,
        vcpus=vcpus,
        disk_gb=_req_disk,
    )
    if not r["success"]:
        return {"vm": None, "status": "error", "reason": r["error"], "name": name, "number": num}

    disk_gb_final = r.get("disk_gb", _req_disk or _default_disk)

    if existing_vm:
        existing_vm.template_name = tpl
        existing_vm.mac_address = mac
        existing_vm.ip_address = f"{VM_SUBNET}.{num}"
        existing_vm.vcpus = vcpus
        existing_vm.ram_mb = ram_mb
        existing_vm.disk_gb = disk_gb_final
        existing_vm.current_state = "shut off"
        existing_vm.ports = build_ports(num)
        existing_vm.deleted_at = None
        if owner_id is not None:
            existing_vm.owner_id = owner_id
        vm = existing_vm
        await session.commit()
        await session.refresh(vm)
    else:
        vm = VirtualMachine(
            name=name, template_name=tpl, mac_address=mac,
            ip_address=f"{VM_SUBNET}.{num}",
            vcpus=vcpus, ram_mb=ram_mb,
            disk_gb=disk_gb_final, current_state="shut off",
            ports=build_ports(num),
            owner_id=owner_id,
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
                    "vm", vm.id, ip_address=ip_address, user_id=owner_id)
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
    result = await list_vms_service(session, vm_manager, state, include_templates, limit, offset, user)
    items = []
    for vm in result["items"]:
        item = VirtualMachineResponse.model_validate(vm)
        item.owner_name = vm.owner.full_name if vm.owner else None
        items.append(item)
    return {"items": items, "total": result["total"], "limit": result["limit"], "offset": result["offset"]}


@router.get("/light")
async def list_vms_light(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    query = select(VirtualMachine).where(
        VirtualMachine.deleted_at.is_(None),
        VirtualMachine.template_id.is_(None),
    )
    if user.role.name == "profesor":
        query = query.where(VirtualMachine.owner_id == user.id)
    query = query.order_by(VirtualMachine.name)
    result = await session.execute(query)
    vms = result.scalars().all()
    return {"items": vms}


@router.get("/next-number", response_model=NextNumberResponse)
async def get_next_vm_number(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    next_number = await _get_next_vm_number(session)
    return NextNumberResponse(next_number=next_number)


@router.get("/templates")
async def list_vm_templates(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(VMTemplate).order_by(VMTemplate.name)
    )
    return {"items": [VMTemplateResponse.model_validate(t) for t in result.scalars().all()]}


@router.get("/{vm_id}", response_model=VirtualMachineResponse)
async def get_vm(
    vm_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    vm = await _get_vm_or_404(session, vm_id, user)
    domain = await asyncio.to_thread(vm_manager.get_domain, vm.name)
    if domain:
        vm.current_state = domain["state"]
        vm.ram_used_mb = domain.get("ram_used_mb")
        vm.ram_percent = domain.get("ram_percent")
    resp = VirtualMachineResponse.model_validate(vm)
    resp.owner_name = vm.owner.full_name if vm.owner else None
    return resp


@router.post("/{vm_id}/start")
async def start_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    vm = await _get_vm_or_404(session, vm_id, user)
    ok = await asyncio.to_thread(vm_manager.start, vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al iniciar VM")
    vm.current_state = "running"
    await session.commit()
    await log_event(session, "vm_start", user.username, f"Inició VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request), user_id=user.id)
    if vm.ip_address and vm.mac_address:
        try:
            from app.services.libvirt_network import ensure_dhcp_host
            ensure_dhcp_host(vm.name, vm.mac_address, vm.ip_address)
        except Exception as e:
            logger.warning("Error asegurando DHCP host para %s: %s", vm.name, e)
    try:
        num = int(vm.name.split("-")[-1])
        await _auto_iptables(num)
    except (ValueError, IndexError):
        pass
    return {"message": f"VM {vm.name} encendida"}


@router.post("/{vm_id}/shutdown")
async def shutdown_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    vm = await _get_vm_or_404(session, vm_id, user)
    ok = await asyncio.to_thread(vm_manager.shutdown, vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al apagar VM")
    vm.current_state = "shut off"
    await session.commit()
    await log_event(session, "vm_shutdown", user.username, f"Apagó VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request), user_id=user.id)
    try:
        num = int(vm.name.split("-")[-1])
        await _auto_uniptables(num)
    except (ValueError, IndexError):
        pass
    return {"message": f"VM {vm.name} apagada"}


@router.post("/{vm_id}/reboot")
async def reboot_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    vm = await _get_vm_or_404(session, vm_id, user)
    ok = await asyncio.to_thread(vm_manager.reboot, vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al reiniciar VM")
    await log_event(session, "vm_reboot", user.username, f"Reinició VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request), user_id=user.id)
    return {"message": f"VM {vm.name} reiniciando"}


@router.post("/{vm_id}/destroy")
async def destroy_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    vm = await _get_vm_or_404(session, vm_id, user)
    ok = await asyncio.to_thread(vm_manager.destroy, vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al forzar apagado")
    vm.current_state = "shut off"
    await session.commit()
    await log_event(session, "vm_destroy", user.username, f"Forzó apagado de VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request), user_id=user.id)
    try:
        num = int(vm.name.split("-")[-1])
        await _auto_uniptables(num)
    except (ValueError, IndexError):
        pass
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
        disk_gb=body.disk_gb,
        username=user.username,
        ip_address=_ip_from_request(request),
        owner_id=user.id,
    )
    if r["status"] == "skipped":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"VM {r['name']} ya existe")
    if r["status"] == "error":
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=r["reason"])
    vm = r["vm"]
    resp = VirtualMachineResponse.model_validate(vm)
    if vm.owner_id is not None:
        await session.refresh(vm, ["owner"])
        resp.owner_name = vm.owner.full_name if vm.owner else None
    return resp


@router.post("/clone-range")
async def clone_vm_range(
    body: CloneRangeRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if body.from_number < 1 or body.to_number > 254 or body.from_number > body.to_number:
        raise HTTPException(status_code=422, detail="Rango inválido (1-254, from <= to)")

    tasks = [
        _clone_vm_task(
            num,
            template_name=body.template_name,
            vcpus=body.vcpus,
            ram_mb=body.ram_mb,
            disk_gb=body.disk_gb,
            username=user.username,
            ip_address=_ip_from_request(request),
            owner_id=user.id,
        )
        for num in range(body.from_number, body.to_number + 1)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [_r if not isinstance(_r, Exception) else {"number": None, "name": "error", "status": "error", "reason": str(_r)} for _r in results]


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

    tasks = [
        _clone_vm_task(
            body.start_number + i,
            template_name=body.template_name,
            vcpus=body.vcpus,
            ram_mb=body.ram_mb,
            disk_gb=body.disk_gb,
            prefix=body.prefix,
            username=user.username,
            ip_address=_ip_from_request(request),
            owner_id=user.id,
        )
        for i in range(body.count)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [_r if not isinstance(_r, Exception) else {"number": None, "name": "error", "status": "error", "reason": str(_r)} for _r in results]


@router.post("/{vm_id}/recreate")
async def recreate_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    vm = await _get_vm_or_404(session, vm_id, user)

    assignment_active = await session.execute(
        select(VMAssignment).where(
            VMAssignment.vm_id == vm_id, VMAssignment.released_at.is_(None)
        )
    )
    assignment = assignment_active.scalar_one_or_none()
    max_recreate = get_cached_int("max_vm_recreations", 3)
    if assignment and assignment.recreation_count >= max_recreate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Límite de {max_recreate} recreaciones alcanzado")

    _def_template = get_cached_str("default_template", "ubuntu-server-main")
    _def_ram = get_cached_int("default_vm_ram_mb", 4096)
    _def_vcpus = get_cached_int("default_vm_vcpus", 1)
    r = await clone_service.recreate_vm(
        vm.name,
        template_name=vm.template_name or _def_template,
        mac_address=vm.mac_address,
        memory_mb=vm.ram_mb or _def_ram,
        vcpus=vm.vcpus or _def_vcpus,
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
                    "vm", vm.id, ip_address=_ip_from_request(request), user_id=user.id)
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

    names = [f"vhost-{n}" for n in range(body.from_number, body.to_number + 1)]
    result = await session.execute(
        select(VirtualMachine).where(
            VirtualMachine.name.in_(names),
            VirtualMachine.deleted_at.is_(None),
        )
    )
    vm_map = {vm.name: vm for vm in result.scalars().all()}

    async def _recreate_task(num: int) -> dict:
        name = f"vhost-{num}"
        vm = vm_map.get(name)
        if not vm:
            return {"number": num, "name": name, "status": "not_found"}
        if user.role.name == "profesor" and vm.owner_id != user.id:
            return {"number": num, "name": name, "status": "skipped", "reason": "no es tu VM"}

        async with _clone_semaphore:
            async with async_session() as task_session:
                _def_template = get_cached_str("default_template", "ubuntu-server-main")
                r = await clone_service.recreate_vm(vm.name, template_name=vm.template_name or _def_template)
                if not r["success"]:
                    return {"number": num, "name": name, "status": "error", "reason": r["error"]}

                vm2 = await task_session.get(VirtualMachine, vm.id)
                if not vm2:
                    return {"number": num, "name": name, "status": "error", "reason": "VM no encontrada en sesión"}
                vm2.current_state = "shut off"
                try:
                    vm2.ports = build_ports(num)
                except (ValueError, IndexError):
                    pass
                await task_session.commit()
                await log_event(task_session, "vm_recreate", user.username,
                                f"Recreó {vm2.name} (rango)",
                                "vm", vm2.id, ip_address=_ip_from_request(request), user_id=user.id)
                return {"number": num, "name": name, "status": "recreated"}

    tasks = [_recreate_task(n) for n in range(body.from_number, body.to_number + 1)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [_r if not isinstance(_r, Exception) else {"number": None, "name": "error", "status": "error", "reason": str(_r)} for _r in results]


@router.delete("/{vm_id}")
async def delete_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    vm = await _get_vm_or_404(session, vm_id, user)
    result = await delete_vm_by_id(session, vm_id, vm_manager, clone_service,
                                   user.username, _ip_from_request(request), user_id=user.id)
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
    ids = body.ids
    if user.role.name == "profesor":
        result = await session.execute(
            select(VirtualMachine.id).where(
                VirtualMachine.id.in_(body.ids),
                VirtualMachine.owner_id == user.id,
            )
        )
        ids = [r[0] for r in result.all()]
    return await bulk_delete_vms(session, ids, vm_manager, clone_service,
                                 user.username, _ip_from_request(request), user_id=user.id)


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
    ids = body.ids
    if user.role.name == "profesor":
        result = await session.execute(
            select(VirtualMachine.id).where(
                VirtualMachine.id.in_(body.ids),
                VirtualMachine.owner_id == user.id,
            )
        )
        ids = [r[0] for r in result.all()]
    return await bulk_action_vms(session, ids, body.action, vm_manager,
                                 user.username, _ip_from_request(request), user_id=user.id)


@router.post("/{vm_id}/ports", response_model=VirtualMachineResponse)
async def add_port(
    vm_id: int,
    body: AddPortRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await _get_vm_or_404(session, vm_id, user)
    result = await add_port_to_vm(session, vm_id, body.service, body.port,
                                  user.username, _ip_from_request(request), user_id=user.id)
    resp = VirtualMachineResponse.model_validate(result)
    resp.owner_name = result.owner.full_name if result.owner else None
    return resp


@router.delete("/{vm_id}/ports/{port_index}", response_model=VirtualMachineResponse)
async def remove_port(
    vm_id: int,
    port_index: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await _get_vm_or_404(session, vm_id, user)
    result = await remove_port_from_vm(session, vm_id, port_index,
                                       user.username, _ip_from_request(request), user_id=user.id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Puerto no encontrado")
    resp = VirtualMachineResponse.model_validate(result)
    resp.owner_name = result.owner.full_name if result.owner else None
    return resp


@router.post("/bulk-ports", response_model=VirtualMachineResponse)
async def bulk_ports(
    body: BulkPortsRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await _get_vm_or_404(session, body.vm_id, user)
    result = await bulk_add_ports_to_vm(session, body.vm_id, [p.model_dump() for p in body.ports],
                                        user.username, _ip_from_request(request), user_id=user.id)
    resp = VirtualMachineResponse.model_validate(result)
    resp.owner_name = result.owner.full_name if result.owner else None
    return resp


@router.post("/repair")
async def repair_vms(
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    query = select(VirtualMachine).where(
        VirtualMachine.deleted_at.is_(None),
        VirtualMachine.template_id.is_(None),
    )
    if user.role.name == "profesor":
        query = query.where(VirtualMachine.owner_id == user.id)
    result = await session.execute(query)
    vms = result.scalars().all()

    from app.services.libvirt_network import ensure_dhcp_host, dhcp_host_exists

    async def _repair_one(vm: VirtualMachine) -> dict:
        if vm.current_state != "shut off":
            return {"name": vm.name, "status": "skipped"}
        vol_path = f"/var/lib/libvirt/images/{vm.name}.qcow2"
        await _customize_guest(vol_path, vm.name, initramfs=True)
        if vm.mac_address and vm.ip_address:
            if not dhcp_host_exists(vm.mac_address):
                try:
                    ensure_dhcp_host(vm.name, vm.mac_address, vm.ip_address)
                except Exception as e:
                    return {"name": vm.name, "error": str(e), "status": "error"}
        return {"name": vm.name, "status": "ok"}

    tasks = [_repair_one(vm) for vm in vms]
    raw = await asyncio.gather(*tasks, return_exceptions=True)
    repaired = []
    errors = []
    for r in raw:
        if isinstance(r, Exception):
            errors.append({"vm": "unknown", "error": str(r)})
        elif r["status"] == "ok":
            repaired.append(r["name"])
        elif r["status"] == "error":
            errors.append({"vm": r["name"], "error": r["error"]})
    await log_event(session, "vms_repair", user.username,
                    f"Reparación masiva: {len(repaired)} ok, {len(errors)} errores",
                    ip_address=_ip_from_request(request), user_id=user.id)
    return {"repaired": len(repaired), "errors": errors, "total": len(vms)}
