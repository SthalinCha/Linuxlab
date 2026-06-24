import asyncio
import logging
from app.database.session import async_session
from app.services.sync_vms import sync_libvirt_domains

logger = logging.getLogger(__name__)

_SYNC_INTERVAL = 15
_sync_task: asyncio.Task | None = None


async def start_background_sync():
    global _sync_task
    if _sync_task is None:
        _sync_task = asyncio.create_task(_sync_loop())


async def _sync_loop():
    while True:
        try:
            async with async_session() as session:
                await sync_libvirt_domains(session)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Background sync failed: %s", e)
        await asyncio.sleep(_SYNC_INTERVAL)
