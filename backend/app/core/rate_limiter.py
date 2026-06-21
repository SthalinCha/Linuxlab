import time
import asyncio
from collections import defaultdict
from app.services.config_service import get_cached_int


class RateLimiter:
    def __init__(self):
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> bool:
        max_attempts = get_cached_int("rate_limit_attempts", 5)
        window = get_cached_int("rate_limit_window", 60)
        now = time.time()
        async with self._lock:
            self._attempts[key] = [
                t for t in self._attempts[key] if now - t < window
            ]
            if len(self._attempts[key]) >= max_attempts:
                return False
            self._attempts[key].append(now)
            return True

    async def reset(self, key: str):
        async with self._lock:
            self._attempts.pop(key, None)


login_limiter = RateLimiter()
