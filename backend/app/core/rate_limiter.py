import time
import asyncio
from collections import defaultdict
from app.services.config_service import get_cached_int


class RateLimiter:
    def __init__(self, max_attempts: int | None = None, window_seconds: int | None = None):
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()
        self._max_attempts_override = max_attempts
        self._window_override = window_seconds

    async def check(self, key: str) -> bool:
        max_attempts = self._max_attempts_override if self._max_attempts_override is not None else get_cached_int("rate_limit_attempts", 5)
        window = self._window_override if self._window_override is not None else get_cached_int("rate_limit_window", 60)
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
