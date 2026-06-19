import time
import asyncio
import logging
import psutil
from collections import deque
from threading import Lock
from sqlalchemy import select, text
from app.core.libvirt.connection import get_connection, HAVE_LIBVIRT
from app.database.session import async_session
from app.models.host_metric import HostMetric

logger = logging.getLogger(__name__)


class MetricsCollector:
    def __init__(self):
        self.cpu_history = deque(maxlen=288)
        self.ram_history = deque(maxlen=288)
        self.disk_history = deque(maxlen=288)
        self._lock = Lock()
        self._vm_cpu_cache: dict[str, dict] = {}

    async def collect(self):
        cpu = psutil.cpu_percent(interval=0)
        ram = psutil.virtual_memory().percent
        disk = psutil.disk_usage("/").percent
        now = time.time()
        timestamp = time.strftime("%H:%M", time.localtime(now))

        with self._lock:
            self.cpu_history.append({"time": timestamp, "cpu": round(cpu, 1)})
            self.ram_history.append({"time": timestamp, "ram": round(ram, 1)})
            self.disk_history.append({"time": timestamp, "disk": round(disk, 1)})

        try:
            async with async_session() as session:
                session.add(HostMetric(
                    cpu_percent=round(cpu, 1),
                    ram_percent=round(ram, 1),
                    disk_percent=round(disk, 1),
                ))
                await session.execute(
                    text("DELETE FROM host_metrics WHERE timestamp < datetime('now', '-48 hours')")
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
        if session is not None:
            result = await session.execute(
                select(HostMetric).order_by(HostMetric.timestamp.desc()).limit(288)
            )
            rows = result.scalars().all()
            if rows:
                rows.reverse()
                cpu = [{"time": r.timestamp.strftime("%H:%M"), "cpu": round(r.cpu_percent, 1)} for r in rows]
                ram = [{"time": r.timestamp.strftime("%H:%M"), "ram": round(r.ram_percent, 1)} for r in rows]
                return {"cpu_history": cpu, "ram_history": ram}

        with self._lock:
            cpu = list(self.cpu_history)
            ram = list(self.ram_history)
        if not cpu:
            c = psutil.cpu_percent(interval=0)
            r = psutil.virtual_memory().percent
            t = time.strftime("%H:%M")
            cpu = [{"time": t, "cpu": round(c, 1)}]
            ram = [{"time": t, "ram": round(r, 1)}]
        return {"cpu_history": cpu, "ram_history": ram}

    def get_vm_stats(self):
        if not HAVE_LIBVIRT:
            return {"top_cpu": [], "top_ram": []}

        conn = get_connection()
        seen = set()
        stats = []
        now = time.time()

        def _is_vm(name):
            return not ("template" in name.lower() or name == "ubuntu-server-main")

        def _read_cpu_time_sec(dom) -> float:
            try:
                raw = dom.getCPUStats(total=True)
                if raw and len(raw) > 0:
                    return raw[0].get("cpu_time", 0) / 1e9
            except Exception as e:
                logger.debug("getCPUStats falló para %s: %s", dom.name(), e)
            return 0.0

        for domain_id in conn.listDomainsID():
            try:
                dom = conn.lookupByID(domain_id)
                name = dom.name()
                if not _is_vm(name) or name in seen:
                    continue
                seen.add(name)
                state, max_mem, mem, vcpus, cpu_time = dom.info()
                cpu_time_sec = _read_cpu_time_sec(dom)

                cpu_percent = 0.0
                prev = self._vm_cpu_cache.get(name)
                if prev and cpu_time_sec > prev["cpu_time"]:
                    elapsed = now - prev["time"]
                    if elapsed > 0 and vcpus > 0:
                        cpu_delta = cpu_time_sec - prev["cpu_time"]
                        pct = (cpu_delta / elapsed) / vcpus * 100
                        cpu_percent = round(min(max(pct, 0), 100), 1)
                self._vm_cpu_cache[name] = {"cpu_time": cpu_time_sec, "time": now}

                ram_used_gb = round(mem / (1024 * 1024), 1) if mem else 0

                stats.append({
                    "name": name,
                    "cpu_percent": cpu_percent,
                    "ram_gb": ram_used_gb,
                })
            except Exception as e:
                logger.warning("Error leyendo domain activo: %s", e)
                continue

        for name in conn.listDefinedDomains():
            try:
                if not _is_vm(name) or name in seen:
                    continue
                seen.add(name)
                stats.append({
                    "name": name,
                    "cpu_percent": 0.0,
                    "ram_gb": 0.0,
                })
            except Exception as e:
                logger.warning("Error leyendo domain definido %s: %s", name, e)
                continue

        top_cpu = sorted(stats, key=lambda x: x["cpu_percent"], reverse=True)[:5]
        top_ram = sorted(stats, key=lambda x: x["ram_gb"], reverse=True)[:5]

        return {
            "top_cpu": [{"name": s["name"], "cpu_percent": s["cpu_percent"]} for s in top_cpu],
            "top_ram": [{"name": s["name"], "ram_gb": s["ram_gb"]} for s in top_ram],
        }


collector = MetricsCollector()
