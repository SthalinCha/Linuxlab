import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VirtualMachine, VMAssignment
from app.core.audit import log_event
from app.core.utils import num_from_name
from app.services.iptables_service import unforward_range

logger = logging.getLogger(__name__)


async def delete_vm_by_id(session: AsyncSession, vm_id: int, vm_manager, clone_service,
                          username: str, ip_address: str, user_id: int | None = None) -> dict | None:
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
    )
    vm = result.scalar_one_or_none()
    if not vm:
        return None

    num = num_from_name(vm.name)
    if num:
        try:
            await asyncio.to_thread(unforward_range, num, num)
        except Exception as e:
            logger.warning("Error eliminando iptables para VM %s: %s", num, e)
    await asyncio.to_thread(vm_manager.destroy, vm.name)
    await asyncio.to_thread(vm_manager.undefine, vm.name)
    await asyncio.to_thread(clone_service.delete_vm_storage, vm.name)
    vm.soft_delete()
    await session.commit()
    await log_event(session, "vm_delete", username, f"Eliminó VM {vm.name}",
                    "vm", vm.id, ip_address=ip_address, user_id=user_id)
    return {"message": f"VM {vm.name} eliminada"}


async def bulk_delete_vms(session: AsyncSession, vm_ids: list[int],
                          vm_manager, clone_service,
                          username: str, ip_address: str, user_id: int | None = None) -> list[dict]:
    if not vm_ids:
        return []

    result = await session.execute(
        select(VirtualMachine).where(
            VirtualMachine.id.in_(vm_ids), VirtualMachine.deleted_at.is_(None)
        )
    )
    vm_map = {vm.id: vm for vm in result.scalars().all()}

    results = []
    for vm_id in vm_ids:
        vm = vm_map.get(vm_id)
        if not vm:
            results.append({"id": vm_id, "status": "not_found"})
            continue
        num = num_from_name(vm.name)
        if num:
            try:
                await asyncio.to_thread(unforward_range, num, num)
            except Exception as e:
                logger.warning("Error eliminando iptables para VM %s: %s", num, e)
        await asyncio.to_thread(vm_manager.destroy, vm.name)
        await asyncio.to_thread(vm_manager.undefine, vm.name)
        await asyncio.to_thread(clone_service.delete_vm_storage, vm.name)
        vm.soft_delete()
        await session.commit()
        await log_event(session, "vm_delete", username, f"Eliminó VM {vm.name} (masivo)",
                        "vm", vm.id, ip_address=ip_address, user_id=user_id)
        results.append({"id": vm_id, "name": vm.name, "status": "deleted"})

    return results


async def bulk_action_vms(session: AsyncSession, vm_ids: list[int], action: str,
                          vm_manager, username: str, ip_address: str, user_id: int | None = None) -> list[dict]:
    if not vm_ids:
        return []

    action_map = {
        "start": vm_manager.start_async,
        "shutdown": vm_manager.shutdown_async,
        "reboot": vm_manager.reboot_async,
        "destroy": vm_manager.destroy_async,
    }
    action_fn = action_map.get(action)
    if not action_fn:
        return []

    result = await session.execute(
        select(VirtualMachine).where(
            VirtualMachine.id.in_(vm_ids), VirtualMachine.deleted_at.is_(None)
        )
    )
    vm_map = {vm.id: vm for vm in result.scalars().all()}

    results = []
    for vm_id in vm_ids:
        vm = vm_map.get(vm_id)
        if not vm:
            results.append({"id": vm_id, "status": "not_found"})
            continue
        ok = await action_fn(vm.name)
        if ok:
            new_state = "running" if action == "start" else "shut off"
            vm.current_state = new_state
            await session.commit()
            await log_event(session, f"vm_{action}", username,
                            f"{action} masivo en {vm.name}",
                            "vm", vm.id, ip_address=ip_address, user_id=user_id)
            results.append({"id": vm_id, "name": vm.name, "status": "ok"})
        else:
            results.append({"id": vm_id, "name": vm.name, "status": "error"})

    return results

