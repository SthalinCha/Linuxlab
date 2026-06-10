import logging
import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.database.models import VirtualMachine, VMAssignment
from app.core.security import get_current_admin
from app.database.models import Admin
from app.libvirt_layer.vm_manager import VMManager
from app.services.clone_service import CloneService, mac_from_num
from app.services.vm_service import build_ports
from app.services.iptables_service import forward_port, unforward_port, forward_range, unforward_range
from app.config import VM_SUBNET
from app.core.audit import log_event

_cpu_cache: dict[str, dict] = {}

logger = logging.getLogger(__name__)

router = APIRouter()
vm_manager = VMManager()
clone_service = CloneService()


class CloneRequest(BaseModel):
    number: int
    template_name: Optional[str] = None
    vcpus: Optional[int] = None
    ram_mb: Optional[int] = None


class CloneRangeRequest(BaseModel):
    from_number: int
    to_number: int
    template_name: Optional[str] = None
    vcpus: Optional[int] = None
    ram_mb: Optional[int] = None


class CreateLabRequest(BaseModel):
    count: int
    start_number: int
    prefix: str = "vhost"
    template_name: Optional[str] = None
    vcpus: Optional[int] = None
    ram_mb: Optional[int] = None


class BulkDeleteRequest(BaseModel):
    ids: list[int]


class AddPortRequest(BaseModel):
    service: str
    port: int


class BulkActionRequest(BaseModel):
    ids: list[int]
    action: str


def _ip_from_request(request: Request) -> str:
    return request.client.host if request.client else ""


def _num_from_name(name: str) -> int:
    try:
        return int(name.split("-")[-1])
    except (ValueError, IndexError):
        return 0


def _auto_iptables(num: int):
    try:
        forward_range(num, num)
    except Exception as e:
        logger.warning("Error configurando iptables para VM %s: %s", num, e)


def _auto_uniptables(num: int):
    try:
        unforward_range(num, num)
    except Exception as e:
        logger.warning("Error eliminando iptables para VM %s: %s", num, e)


@router.get("")
async def list_vms(
    state: Optional[str] = None,
    include_templates: bool = False,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    from app.services.sync_vms import sync_libvirt_domains
    await sync_libvirt_domains(session)

    query = select(VirtualMachine).where(VirtualMachine.is_active == True)
    if not include_templates:
        query = query.where(VirtualMachine.is_template == False)
    if state:
        query = query.where(VirtualMachine.current_state == state)
    query = query.order_by(VirtualMachine.name)
    result = await session.execute(query)
    vms = result.scalars().all()

    domains = vm_manager.list_domains()
    domain_map = {d["name"]: d for d in domains}
    now = time.time()
    for vm in vms:
        domain = domain_map.get(vm.name)
        if domain:
            vm.current_state = domain["state"]
            vm.ram_used_mb = domain.get("ram_used_mb")
            vm.ram_percent = domain.get("ram_percent")
            vm.max_ram_mb = domain.get("max_mem_mb")

            live_vcpus = domain.get("vcpus")
            vm.live_vcpus = live_vcpus

            cpu_time_sec = domain.get("cpu_time_sec", 0)
            prev = _cpu_cache.get(vm.name)
            if prev and cpu_time_sec > prev["cpu_time"] and domain["state"] == "running":
                elapsed = now - prev["time"]
                if elapsed > 0:
                    cpu_delta = cpu_time_sec - prev["cpu_time"]
                    vcpus = live_vcpus or vm.vcpus
                    pct = (cpu_delta / elapsed) / vcpus * 100
                    vm.cpu_usage_percent = round(min(max(pct, 0), 100), 1)
            _cpu_cache[vm.name] = {"cpu_time": cpu_time_sec, "time": now}
    return vms


@router.get("/{vm_id}")
async def get_vm(
    vm_id: int,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    result = await session.execute(select(VirtualMachine).where(VirtualMachine.id == vm_id))
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    domain = vm_manager.get_domain(vm.name)
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
    admin: Admin = Depends(get_current_admin),
):
    result = await session.execute(select(VirtualMachine).where(VirtualMachine.id == vm_id))
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    ok = vm_manager.start(vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al iniciar VM")
    vm.current_state = "running"
    await session.commit()
    await log_event(session, "vm_start", admin.username, f"Inició VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} encendida"}


@router.post("/{vm_id}/shutdown")
async def shutdown_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    result = await session.execute(select(VirtualMachine).where(VirtualMachine.id == vm_id))
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    ok = vm_manager.shutdown(vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al apagar VM")
    vm.current_state = "shut off"
    await session.commit()
    await log_event(session, "vm_shutdown", admin.username, f"Apagó VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} apagada"}


@router.post("/{vm_id}/reboot")
async def reboot_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    result = await session.execute(select(VirtualMachine).where(VirtualMachine.id == vm_id))
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    ok = vm_manager.reboot(vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al reiniciar VM")
    await log_event(session, "vm_reboot", admin.username, f"Reinició VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} reiniciando"}


@router.post("/{vm_id}/destroy")
async def destroy_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    result = await session.execute(select(VirtualMachine).where(VirtualMachine.id == vm_id))
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    ok = vm_manager.destroy(vm.name)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al forzar apagado")
    vm.current_state = "shut off"
    await session.commit()
    await log_event(session, "vm_destroy", admin.username, f"Forzó apagado de VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} forzada a apagar"}


@router.post("/clone")
async def clone_vm(
    body: CloneRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    new_name = f"vhost-{body.number}"
    new_mac = mac_from_num(body.number)

    existing = await session.execute(
        select(VirtualMachine).where(VirtualMachine.name == new_name)
    )
    existing_vm = existing.scalar_one_or_none()
    if existing_vm and existing_vm.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"VM {new_name} ya existe")

    result = clone_service.clone_vm(
        source_name=body.template_name or "ubuntu-server-main",
        new_name=new_name,
        new_mac=new_mac,
        memory_mb=body.ram_mb or 4096,
        vcpus=body.vcpus or 1,
    )
    if not result["success"]:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result["error"])

    if existing_vm:
        existing_vm.template_name = body.template_name or "ubuntu-server-main"
        existing_vm.mac_address = new_mac
        existing_vm.ip_address = f"{VM_SUBNET}.{body.number}"
        existing_vm.vcpus = body.vcpus or 1
        existing_vm.ram_mb = body.ram_mb or 4096
        existing_vm.disk_gb = 10
        existing_vm.current_state = "shut off"
        existing_vm.ports = build_ports(body.number)
        existing_vm.is_active = True
        existing_vm.is_template = False
        vm = existing_vm
        await session.commit()
        await session.refresh(vm)
    else:
        vm = VirtualMachine(
            name=new_name,
            template_name=body.template_name or "ubuntu-server-main",
            mac_address=new_mac,
            ip_address=f"{VM_SUBNET}.{body.number}",
            vcpus=body.vcpus or 1,
            ram_mb=body.ram_mb or 4096,
            disk_gb=10,
            current_state="shut off",
            ports=build_ports(body.number),
        )
        from sqlalchemy.exc import IntegrityError
        try:
            session.add(vm)
            await session.commit()
            await session.refresh(vm)
        except IntegrityError:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"VM {new_name} ya existe (conflicto de integridad)")
    _auto_iptables(body.number)
    await log_event(session, "vm_clone", admin.username, f"Clonó VM {new_name} desde plantilla",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return vm


@router.post("/clone-range")
async def clone_vm_range(
    body: CloneRangeRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    from sqlalchemy.exc import IntegrityError
    if body.from_number < 1 or body.to_number > 254 or body.from_number > body.to_number:
        raise HTTPException(status_code=422, detail="Rango inválido (1-254, from <= to)")

    results = []
    for num in range(body.from_number, body.to_number + 1):
        new_name = f"vhost-{num}"
        new_mac = mac_from_num(num)

        existing = await session.execute(
            select(VirtualMachine).where(VirtualMachine.name == new_name)
        )
        existing_vm = existing.scalar_one_or_none()
        if existing_vm and existing_vm.is_active:
            results.append({"number": num, "name": new_name, "status": "skipped", "reason": "ya existe"})
            continue

        r = clone_service.clone_vm(
            source_name=body.template_name or "ubuntu-server-main",
            new_name=new_name,
            new_mac=new_mac,
            memory_mb=body.ram_mb or 4096,
            vcpus=body.vcpus or 1,
        )
        if not r["success"]:
            results.append({"number": num, "name": new_name, "status": "error", "reason": r["error"]})
            continue

        if existing_vm:
            existing_vm.template_name = body.template_name or "ubuntu-server-main"
            existing_vm.mac_address = new_mac
            existing_vm.ip_address = f"{VM_SUBNET}.{num}"
            existing_vm.vcpus = body.vcpus or 1
            existing_vm.ram_mb = body.ram_mb or 4096
            existing_vm.disk_gb = 10
            existing_vm.current_state = "shut off"
            existing_vm.ports = build_ports(num)
            existing_vm.is_active = True
            existing_vm.is_template = False
            vm = existing_vm
            await session.commit()
            await session.refresh(vm)
        else:
            vm = VirtualMachine(
                name=new_name,
                template_name=body.template_name or "ubuntu-server-main",
                mac_address=new_mac,
                ip_address=f"{VM_SUBNET}.{num}",
                vcpus=body.vcpus or 1,
                ram_mb=body.ram_mb or 4096,
                disk_gb=10,
                current_state="shut off",
                ports=build_ports(num),
            )
            session.add(vm)
            try:
                await session.commit()
                await session.refresh(vm)
            except IntegrityError:
                await session.rollback()
                results.append({"number": num, "name": new_name, "status": "error", "reason": "conflicto de integridad"})
                continue
        _auto_iptables(num)
        await log_event(session, "vm_clone", admin.username, f"Clonó VM {new_name} desde plantilla (rango)",
                        "vm", vm.id, ip_address=_ip_from_request(request))
        results.append({"number": num, "name": new_name, "status": "created"})

    return results


@router.post("/create-lab")
async def create_lab(
    body: CreateLabRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    from sqlalchemy.exc import IntegrityError
    if body.count < 1 or body.count > 50:
        raise HTTPException(status_code=422, detail="Cantidad inválida (1-50)")
    if body.start_number < 1 or body.start_number > 254:
        raise HTTPException(status_code=422, detail="Número inicial inválido")

    results = []
    for i in range(body.count):
        num = body.start_number + i
        new_name = f"{body.prefix}-{num}"
        new_mac = mac_from_num(num)

        existing = await session.execute(
            select(VirtualMachine).where(VirtualMachine.name == new_name)
        )
        existing_vm = existing.scalar_one_or_none()
        if existing_vm and existing_vm.is_active:
            results.append({"number": num, "name": new_name, "status": "skipped", "reason": "ya existe"})
            continue

        r = clone_service.clone_vm(
            source_name=body.template_name or "ubuntu-server-main",
            new_name=new_name,
            new_mac=new_mac,
            memory_mb=body.ram_mb or 4096,
            vcpus=body.vcpus or 1,
        )
        if not r["success"]:
            results.append({"number": num, "name": new_name, "status": "error", "reason": r["error"]})
            continue

        if existing_vm:
            existing_vm.template_name = body.template_name or "ubuntu-server-main"
            existing_vm.mac_address = new_mac
            existing_vm.ip_address = f"{VM_SUBNET}.{num}"
            existing_vm.vcpus = body.vcpus or 1
            existing_vm.ram_mb = body.ram_mb or 4096
            existing_vm.disk_gb = 10
            existing_vm.current_state = "shut off"
            existing_vm.ports = build_ports(num)
            existing_vm.is_active = True
            existing_vm.is_template = False
            vm = existing_vm
            await session.commit()
            await session.refresh(vm)
        else:
            vm = VirtualMachine(
                name=new_name,
                template_name=body.template_name or "ubuntu-server-main",
                mac_address=new_mac,
                ip_address=f"{VM_SUBNET}.{num}",
                vcpus=body.vcpus or 1,
                ram_mb=body.ram_mb or 4096,
                disk_gb=10,
                current_state="shut off",
                ports=build_ports(num),
            )
            session.add(vm)
            try:
                await session.commit()
                await session.refresh(vm)
            except IntegrityError:
                await session.rollback()
                results.append({"number": num, "name": new_name, "status": "error", "reason": "conflicto de integridad"})
            continue
        _auto_iptables(num)
        await log_event(session, "vm_clone", admin.username, f"Creó VM {new_name} (laboratorio)",
                        "vm", vm.id, ip_address=_ip_from_request(request))
        results.append({"number": num, "name": new_name, "status": "created"})

    return results


@router.post("/{vm_id}/recreate")
async def recreate_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.is_active == True)
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")

    assignment_active = await session.execute(
        select(VMAssignment).where(
            VMAssignment.id_vm == vm_id, VMAssignment.released_at.is_(None)
        )
    )
    assignment = assignment_active.scalar_one_or_none()
    if assignment and assignment.recreate_count >= 3:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Límite de 3 recreaciones alcanzado")

    r = clone_service.recreate_vm(
        vm.name,
        template_name=vm.template_name,
        mac_address=vm.mac_address,
        memory_mb=vm.ram_mb or 4096,
        vcpus=vm.vcpus or 1,
    )
    if not r["success"]:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=r["error"])

    if assignment:
        assignment.recreate_count += 1
    vm.current_state = "shut off"
    await session.commit()
    await log_event(session, "vm_recreate", admin.username, f"Recreó VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} recreada", "recreate_count": assignment.recreate_count if assignment else 0}


class RecreateRangeRequest(BaseModel):
    from_number: int
    to_number: int


@router.post("/recreate-range")
async def recreate_vm_range(
    body: RecreateRangeRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    if body.from_number < 1 or body.to_number > 254 or body.from_number > body.to_number:
        raise HTTPException(status_code=422, detail="Rango inválido (1-254, from <= to)")

    results = []
    for num in range(body.from_number, body.to_number + 1):
        name = f"vhost-{num}"
        result = await session.execute(
            select(VirtualMachine).where(VirtualMachine.name == name, VirtualMachine.is_active == True)
        )
        vm = result.scalar_one_or_none()
        if not vm:
            results.append({"number": num, "name": name, "status": "not_found"})
            continue

        r = clone_service.recreate_vm(vm.name, template_name=vm.template_name)
        if not r["success"]:
            results.append({"number": num, "name": name, "status": "error", "reason": r["error"]})
            continue

        vm.current_state = "shut off"
        await session.commit()
        await log_event(session, "vm_recreate", admin.username,
                        f"Recreó {vm.name} (rango)",
                        "vm", vm.id, ip_address=_ip_from_request(request))
        results.append({"number": num, "name": name, "status": "recreated"})

    return results


@router.delete("/{vm_id}")
async def delete_vm(
    vm_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.is_active == True)
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")
    num = _num_from_name(vm.name)
    if num:
        _auto_uniptables(num)
    vm_manager.undefine(vm.name)
    clone_service.delete_vm_storage(vm.name)
    vm.is_active = False
    await session.commit()
    await log_event(session, "vm_delete", admin.username, f"Eliminó VM {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return {"message": f"VM {vm.name} eliminada"}


@router.post("/bulk-delete")
async def bulk_delete_vms(
    body: BulkDeleteRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    if not body.ids:
        raise HTTPException(status_code=422, detail="Lista de IDs vacía")

    results = []
    for vm_id in body.ids:
        result = await session.execute(
            select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.is_active == True)
        )
        vm = result.scalar_one_or_none()
        if not vm:
            results.append({"id": vm_id, "status": "not_found"})
            continue
        num = _num_from_name(vm.name)
        if num:
            _auto_uniptables(num)
        vm_manager.undefine(vm.name)
        clone_service.delete_vm_storage(vm.name)
        vm.is_active = False
        await session.commit()
        await log_event(session, "vm_delete", admin.username, f"Eliminó VM {vm.name} (masivo)",
                        "vm", vm.id, ip_address=_ip_from_request(request))
        results.append({"id": vm_id, "name": vm.name, "status": "deleted"})

    return results


@router.post("/bulk-action")
async def bulk_action_vms(
    body: BulkActionRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    if not body.ids:
        raise HTTPException(status_code=422, detail="Lista de IDs vacía")

    action_map = {
        "start": vm_manager.start,
        "shutdown": vm_manager.shutdown,
        "reboot": vm_manager.reboot,
        "destroy": vm_manager.destroy,
    }
    action_fn = action_map.get(body.action)
    if not action_fn:
        raise HTTPException(status_code=422, detail=f"Acción '{body.action}' no válida")

    results = []
    for vm_id in body.ids:
        result = await session.execute(
            select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.is_active == True)
        )
        vm = result.scalar_one_or_none()
        if not vm:
            results.append({"id": vm_id, "status": "not_found"})
            continue
        ok = action_fn(vm.name)
        if ok:
            new_state = "running" if body.action == "start" else "shut off"
            vm.current_state = new_state
            await session.commit()
            await log_event(session, f"vm_{body.action}", admin.username,
                            f"{body.action} masivo en {vm.name}",
                            "vm", vm.id, ip_address=_ip_from_request(request))
            results.append({"id": vm_id, "name": vm.name, "status": "ok"})
        else:
            results.append({"id": vm_id, "name": vm.name, "status": "error"})

    return results


@router.post("/{vm_id}/ports")
async def add_port(
    vm_id: int,
    body: AddPortRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.is_active == True)
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")

    ports = list(vm.ports) if vm.ports else []

    used_host_ports = set()
    for v in (await session.execute(select(VirtualMachine).where(VirtualMachine.is_active == True))).scalars():
        if v.ports:
            for p in v.ports:
                used_host_ports.add(p["host"])

    next_host = 10000
    while next_host in used_host_ports:
        next_host += 1

    ports.append({"host": next_host, "vm": body.port, "service": body.service})
    vm.ports = ports
    await session.commit()
    await session.refresh(vm)

    num = _num_from_name(vm.name)
    dest_ip = f"{VM_SUBNET}.{num}" if num else vm.ip_address or ""
    if dest_ip:
        ok, msg = forward_port(dest_ip, next_host, body.port, f"{body.service} custom {vm.name}")
        if not ok:
            logger.warning("Error creando regla iptables para puerto custom: %s", msg)

    await log_event(session, "port_add", admin.username,
                    f"Añadió puerto {body.service}:{next_host}→{body.port} a {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return vm


@router.delete("/{vm_id}/ports/{port_index}")
async def remove_port(
    vm_id: int,
    port_index: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
):
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.is_active == True)
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM no encontrada")

    ports = list(vm.ports) if vm.ports else []
    if port_index < 0 or port_index >= len(ports):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Puerto no encontrado")

    removed = ports.pop(port_index)
    vm.ports = ports
    await session.commit()
    await session.refresh(vm)

    num = _num_from_name(vm.name)
    dest_ip = f"{VM_SUBNET}.{num}" if num else vm.ip_address or ""
    if dest_ip and removed.get("host"):
        ok, msg = unforward_port(dest_ip, removed["host"], removed["vm"], f"{removed.get('service', '?')} custom {vm.name}")
        if not ok:
            logger.warning("Error eliminando regla iptables para puerto custom: %s", msg)

    await log_event(session, "port_remove", admin.username,
                    f"Eliminó puerto {removed.get('service', '?')}:{removed.get('host', '?')} de {vm.name}",
                    "vm", vm.id, ip_address=_ip_from_request(request))
    return vm
