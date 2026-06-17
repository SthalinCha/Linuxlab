import time
import asyncio
from collections import defaultdict


class RateLimiter:
    def __init__(self, max_attempts: int = 5, window_seconds: int = 60):
        self._max = max_attempts
        self._window = window_seconds
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> bool:
        now = time.time()
        async with self._lock:
            self._attempts[key] = [
                t for t in self._attempts[key] if now - t < self._window
            ]
            if len(self._attempts[key]) >= self._max:
                return False
            self._attempts[key].append(now)
            return True

    async def reset(self, key: str):
        async with self._lock:
            self._attempts.pop(key, None)


login_limiter = RateLimiter()
