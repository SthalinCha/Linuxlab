import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VirtualMachine, VMAssignment
from app.core.audit import log_event
from app.core.utils import num_from_name
from app.services.iptables_service import unforward_range

logger = logging.getLogger(__name__)

_bulk_semaphore = asyncio.Semaphore(5)


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
            await unforward_range(num, num)
        except Exception as e:
            logger.warning("Error eliminando iptables para VM %s: %s", num, e)
    await asyncio.to_thread(vm_manager.destroy, vm.name)
    await asyncio.to_thread(vm_manager.undefine, vm.name)
    await clone_service.delete_vm_storage(vm.name)
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

    from app.database.session import async_session

    result = await session.execute(
        select(VirtualMachine).where(
            VirtualMachine.id.in_(vm_ids), VirtualMachine.deleted_at.is_(None)
        )
    )
    vm_map = {vm.id: vm for vm in result.scalars().all()}

    async def _delete_one(vm_id: int) -> dict:
        vm = vm_map.get(vm_id)
        if not vm:
            return {"id": vm_id, "status": "not_found"}

        async with _bulk_semaphore:
            async with async_session() as task_session:
                num = num_from_name(vm.name)
                if num:
                    try:
                        await unforward_range(num, num)
                    except Exception as e:
                        logger.warning("Error eliminando iptables para VM %s: %s", num, e)

                libvirt_ops = [
                    asyncio.to_thread(vm_manager.destroy, vm.name),
                    asyncio.to_thread(vm_manager.undefine, vm.name),
                    clone_service.delete_vm_storage(vm.name),
                ]
                await asyncio.gather(*libvirt_ops, return_exceptions=True)

                vm2 = await task_session.get(VirtualMachine, vm_id)
                if vm2:
                    vm2.soft_delete()
                    await task_session.commit()
                    await log_event(task_session, "vm_delete", username, f"Eliminó VM {vm2.name} (masivo)",
                                    "vm", vm2.id, ip_address=ip_address, user_id=user_id)
                return {"id": vm_id, "name": vm.name, "status": "deleted"}

    tasks = [_delete_one(vm_id) for vm_id in vm_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [_r if not isinstance(_r, Exception) else {"id": vm_id, "status": "error"}
            for vm_id, _r in zip(vm_ids, results)]


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

    async def _action_one(vm_id: int) -> dict:
        vm = vm_map.get(vm_id)
        if not vm:
            return {"id": vm_id, "status": "not_found"}

        async with _bulk_semaphore:
            ok = await action_fn(vm.name)
            if ok:
                new_state = "running" if action == "start" else "shut off"
                vm.current_state = new_state
                return {"id": vm_id, "name": vm.name, "status": "ok"}
            return {"id": vm_id, "name": vm.name, "status": "error"}

    tasks = [_action_one(vm_id) for vm_id in vm_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    results = [_r if not isinstance(_r, Exception) else {"id": vm_id, "status": "error"}
               for vm_id, _r in zip(vm_ids, results)]

    await session.commit()
    for r in results:
        if r["status"] == "ok":
            vm = vm_map.get(r["id"])
            if vm:
                await log_event(session, f"vm_{action}", username,
                                f"{action} masivo en {vm.name}",
                                "vm", vm.id, ip_address=ip_address, user_id=user_id)
    return results

