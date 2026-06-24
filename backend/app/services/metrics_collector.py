import time
import asyncio
import logging
import psutil
from collections import deque
from threading import Lock
from sqlalchemy import select, text
from datetime import datetime, timedelta, timezone
from app.core.libvirt.connection import get_connection, HAVE_LIBVIRT
from app.database.session import async_session
from app.models.host_metric import HostMetric
from app.core.dates import utc_iso

logger = logging.getLogger(__name__)


_VM_STATS_CACHE_TTL = 30
_HISTORY_CACHE_TTL = 60


class MetricsCollector:
    def __init__(self):
        self.cpu_history = deque(maxlen=288)
        self.ram_history = deque(maxlen=288)
        self.disk_history = deque(maxlen=288)
        self._lock = Lock()
        self._vm_cpu_cache: dict[str, dict] = {}
        self._vm_stats_cache: dict | None = None
        self._vm_stats_cache_time: float = 0
        self._vm_stats_lock = Lock()
        self._history_cache: dict | None = None
        self._history_cache_time: float = 0

    async def collect(self):
        cpu = psutil.cpu_percent(interval=0)
        mem = psutil.virtual_memory()
        ram = mem.percent
        disk = psutil.disk_usage("/").percent
        now = time.time()

        with self._lock:
            self.cpu_history.append({"time": now, "cpu": round(cpu, 1)})
            self.ram_history.append({"time": now, "ram": round(ram, 1)})
            self.disk_history.append({"time": now, "disk": round(disk, 1)})
            self._history_cache = None

        try:
            async with async_session() as session:
                session.add(HostMetric(
                    cpu_percent=round(cpu, 1),
                    ram_percent=round(ram, 1),
                    disk_percent=round(disk, 1),
                ))
                cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
                await session.execute(
                    text("DELETE FROM host_metrics WHERE timestamp < :cutoff"),
                    {"cutoff": cutoff},
                )
                await session.commit()
        except Exception as e:
            logger.error("Error persisting host metrics: %s", e)

    async def start_background_collection(self, interval=300):
        await self.collect()
        while True:
            await asyncio.sleep(interval)
            await self.collect()

    async def get_history(self, session=None):
        with self._lock:
            if self._history_cache is not None and time.time() - self._history_cache_time < _HISTORY_CACHE_TTL:
                return dict(self._history_cache)

        if session is not None:
            result = await session.execute(
                select(HostMetric).order_by(HostMetric.timestamp.desc()).limit(288)
            )
            rows = result.scalars().all()
            if rows:
                rows.reverse()
                cpu = [
                    {"time": utc_iso(r.timestamp), "cpu": round(r.cpu_percent, 1)}
                    for r in rows
                ]
                ram = [
                    {"time": utc_iso(r.timestamp), "ram": round(r.ram_percent, 1)}
                    for r in rows
                ]
                cached = {"cpu_history": cpu, "ram_history": ram}
                with self._lock:
                    self._history_cache = cached
                    self._history_cache_time = time.time()
                return cached

        with self._lock:
            cpu = [{"time": utc_iso(datetime.fromtimestamp(p["time"], tz=timezone.utc)), "cpu": p["cpu"]} for p in self.cpu_history]
            ram = [{"time": utc_iso(datetime.fromtimestamp(p["time"], tz=timezone.utc)), "ram": p["ram"]} for p in self.ram_history]
        if not cpu:
            now = time.time()
            c = psutil.cpu_percent(interval=0)
            r = psutil.virtual_memory().percent
            t = utc_iso(datetime.fromtimestamp(now, tz=timezone.utc))
            cpu = [{"time": t, "cpu": round(c, 1)}]
            ram = [{"time": t, "ram": round(r, 1)}]
        cached = {"cpu_history": cpu, "ram_history": ram}
        with self._lock:
            self._history_cache = cached
            self._history_cache_time = time.time()
        return cached

    def get_vm_stats(self, exclude_names: set | None = None):
        if not HAVE_LIBVIRT:
            return {"top_cpu": [], "top_ram": []}

        now = time.time()
        with self._vm_stats_lock:
            if self._vm_stats_cache is not None and now - self._vm_stats_cache_time < _VM_STATS_CACHE_TTL:
                return dict(self._vm_stats_cache)

        from app.core.libvirt.vm_manager import VMManager
        mgr = VMManager()
        domains = mgr.list_domains()
        conn = get_connection()
        stats = []

        for dom_data in domains:
            name = dom_data["name"]
            if exclude_names and name in exclude_names:
                continue

            state = dom_data["state"]
            vcpus = dom_data.get("vcpus", 0)
            ram_used_mb = dom_data.get("ram_used_mb", 0)
            ram_rss_mb = dom_data.get("ram_rss_mb", 0)

            cpu_percent = 0.0
            if state == "running":
                try:
                    dom = conn.lookupByName(name)
                    raw = dom.getCPUStats(total=True)
                    if raw and len(raw) > 0:
                        cpu_time_sec = raw[0].get("cpu_time", 0) / 1e9
                        prev = self._vm_cpu_cache.get(name)
                        if prev and cpu_time_sec > prev["cpu_time"]:
                            elapsed = now - prev["time"]
                            if elapsed > 0 and vcpus > 0:
                                cpu_delta = cpu_time_sec - prev["cpu_time"]
                                pct = (cpu_delta / elapsed) / vcpus * 100
                                cpu_percent = round(min(max(pct, 0), 100), 1)
                        self._vm_cpu_cache[name] = {"cpu_time": cpu_time_sec, "time": now}
                except Exception as e:
                    logger.debug("getCPUStats falló para %s: %s", name, e)

            ram_gb = 0.0
            if state == "running":
                ram_gb = round(ram_rss_mb / 1024, 1) if ram_rss_mb else round(ram_used_mb / 1024, 1) if ram_used_mb else 0
            stats.append({"name": name, "cpu_percent": cpu_percent, "ram_gb": ram_gb})

        top_cpu = sorted(stats, key=lambda x: x["cpu_percent"], reverse=True)[:5]
        top_ram = sorted(stats, key=lambda x: x["ram_gb"], reverse=True)[:5]

        result = {
            "top_cpu": [{"name": s["name"], "cpu_percent": s["cpu_percent"]} for s in top_cpu],
            "top_ram": [{"name": s["name"], "ram_gb": s["ram_gb"]} for s in top_ram],
        }
        with self._vm_stats_lock:
            self._vm_stats_cache = result
            self._vm_stats_cache_time = now
        return result


collector = MetricsCollector()
