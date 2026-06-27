import asyncio
from typing import Optional
from fastapi import HTTPException, status


class OperationLock:
    def __init__(self):
        self._locks: dict[str, asyncio.Lock] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, key: str, timeout: Optional[float] = None) -> bool:
        async with self._lock:
            if key not in self._locks:
                self._locks[key] = asyncio.Lock()
            lock = self._locks[key]
        try:
            if timeout is not None:
                await asyncio.wait_for(lock.acquire(), timeout=timeout)
            else:
                await lock.acquire()
            return True
        except (asyncio.TimeoutError, asyncio.CancelledError):
            return False

    def release(self, key: str) -> None:
        lock = self._locks.get(key)
        if lock and lock.locked():
            lock.release()


operation_lock = OperationLock()


async def with_op_lock(key: str, timeout: Optional[float] = None):
    acquired = await operation_lock.acquire(key, timeout)
    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Operación duplicada: {key}. La solicitud anterior aún está en proceso.",
        )
    return key
