import asyncio
import sys
sys.path.insert(0, ".")

from app.database.session import async_session
from app.models import VirtualMachine
from sqlalchemy import select, update


async def main():
    async with async_session() as session:
        result = await session.execute(
            select(VirtualMachine).where(
                VirtualMachine.deleted_at.is_(None),
                VirtualMachine.template_id.is_(None),
            )
        )
        vms = result.scalars().all()
        updated = 0
        for vm in vms:
            changes = []
            if vm.vcpus != 2:
                vm.vcpus = 2
                changes.append("vcpus: 1→2")
            if vm.disk_gb != 20:
                vm.disk_gb = 20
                changes.append(f"disk_gb: {vm.disk_gb}→20")
            if vm.ram_mb != 4096:
                vm.ram_mb = 4096
                changes.append(f"ram_mb: {vm.ram_mb}→4096")
            if changes:
                updated += 1
                print(f"  {vm.name}: {', '.join(changes)}")
        await session.commit()
        print(f"\nActualizadas {updated} de {len(vms)} VMs")


if __name__ == "__main__":
    asyncio.run(main())
