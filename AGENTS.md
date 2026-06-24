## Goal
Comprehensive hardening and optimization of LinuxLab backend: fix all remaining bottleneck classes, parallelize VM creation, wire up iptables batching, eliminate crash bugs, and reduce libvirt/DB overhead to achieve 50–200 VM scalability.

## Constraints & Preferences
- No API/DB schema/response format changes.
- No feature removal or endpoint contract changes.
- Prioritize real performance impact over theoretical best practices.
- Internal refactors and flow changes allowed if they improve performance without breaking API.
- Test suite must remain at 93 passed / 0 failures (pre-existing 13 assignment errors are fixture-level and acceptable).

## Progress
### Done
- **Phase 0–4d and earlier RBAC/Course/Infra work** (see archived history below).
- **C1 (CRITICAL):** Fixed `asyncio.create_task()` from sync thread — `_get_cached` now detects event-loop availability before scheduling refresh. Background refresh loop keeps cache fresh regardless.
- **A1 (HIGH):** Parallelized `create-lab` and `clone-range` — both now use `asyncio.gather` + `guestfish_semaphore` to run up to 3 concurrent VM creations. Sequential creation (25 min for 50 VMs) → parallel (~5 min).
- **A2 (HIGH):** Wired up iptables batch — `forward_range`, `forward_port`, `unforward_range`, `_add_prerouting_and_output`, `_del_prerouting_and_output` all now use `_add_batch_rule` / `_del_batch_rule` instead of per-rule `iptables -C` + `iptables -A`. Batch flushes at threshold (20) or at end. 1000 subprocess calls → 2–3 `iptables-restore` calls.
- **A3 (HIGH):** Added `VMManager.get_cached_domains_if_fresh()` — `vm_list_service.list_vms` now checks cache in event-loop first, only delegates to thread-pool when cache is cold. Eliminates ~1ms thread-switch overhead per request on hot path.
- **M1 (MEDIUM):** Optimized `recreate_vm` — replaces two-volume (temp + canonical) approach with single temp volume + `os.rename()` + `pool.refresh()`. Eliminates one `pool.createXML()`, one `defineXML()`, and one volume delete per recreation.
- **M2 (MEDIUM):** Fixed `batch_create` N+1 — replaced per-item `session.get()` loops with two batch queries (`select(VirtualMachine).where(id.in_(...))` + `select(Student).where(id.in_(...))`). 100+ round trips → 2.
- **M3 (MEDIUM):** Optimized port operations — removed global `_port_lock` critical section; per-VM port appends no longer serialize across unrelated VMs.
- **M4 (MEDIUM):** Removed `_top_consumers_lock` and `_history_lock` in dashboard endpoints — inner collector already has `_vm_stats_lock` and `_lock`. Eliminates lock contention on every dashboard call.
- **M5 (MEDIUM):** Removed `threading.Lock` from `_cpu_cache` in `vm_list_service` — all access is from a single event-loop thread; plain dict operations are safe.
- **Test suite:** 93 passed / 0 failed / 13 pre-existing ERRORs. Zero regressions from all optimizations.
- **Docker image:** `linuxlab-backend:latest` built successfully.
- **Frontend:** TypeScript + vite build OK (chunk-size warning only).

### In Progress
- *(none)*

### Blocked
- 13 pre-existing `ERROR`s in `test_assignments.py` — `MissingGreenlet`/`transaction already deassociated` caused by `asyncio_default_fixture_loop_scope = session` fixture scoping. Pre-dates all changes. Not a production risk.

## Key Decisions
- **`_schedule_refresh` guard:** Use `asyncio.get_running_loop()` to detect sync-thread context; skip `create_task` when called from thread pool. Background refresh loop guarantees eventual consistency.
- **iptables batch wiring:** `_add_prerouting_and_output` and `_del_prerouting_and_output` now use batch by default. Single-rule `_add_rule`/`_del_rule` retained as fallback for rare non-batch calls.
- **recreate_vm volume strategy:** Accept `os.rename` + `pool.refresh()` instead of two-volume swap. `pool.refresh()` is a single libvirt call that rescans directory — fast and safe on local filesystem pools.
- **create-lab parallelism:** Use `guestfish_semaphore` as concurrency limiter (max 3 simultaneous guestfish ops). `_libvirt_clone` (fast, ~1s) runs sequentially before semaphore; `_customize_guest` runs under semaphore control.
- **Frontend:** Served by nginx host (no Docker) — eliminates port conflict, simplifies deployment, enables real HTTPS.
- **Backend:** Remains in Docker with `network_mode: host` for libvirt access.
- **Ghost VMs** (orphaned DB records without libvirt domain) are not deleted — risk of breaking existing assignments.

## Next Steps
- *(No remaining high-priority work; all CRITICAL and HIGH items resolved.)*
- Future: Optional further tuning of `_DOMAINS_CACHE_TTL` (currently 3s) based on production sync frequency.
- Future: Consider adding `pool_pre_ping` retry logic for MySQL network blips.
- Future: Add `Student.email` unique constraint in Alembic migration (LOW priority).
- Future: Certificado SSL real (Let's Encrypt), backup automático MariaDB, deshabilitar `/docs` en producción, rate limiting login.

## Critical Context
- **C1 (create_task from thread pool)** was a real crash bug — occurred when `_get_cached` was called from `asyncio.to_thread` (in `clone_vm`/`recreate_vm`) and cache was stale. Fixed by checking event-loop availability.
- **create-lab/clone-range** were fully sequential — `for` loop with `await` per VM meant 25+ minutes for 50 VMs. Now parallel with `asyncio.gather` + semaphore: ~5 minutes.
- **iptables batch was dead code** — `_add_batch_rule` existed but was never called. All paths used `_add_rule` → 2 subprocess calls per rule. Now wired to batch accumulator; compatible with existing tests.
- **`os.rename()` + `pool.refresh()`** is safe because: (a) source and dest are on same filesystem (atomic rename), (b) pool refresh is a fast metadata scan, (c) old volume already deleted by libvirt.
- **HOST_IP** env var still required for startup; test suite needs `DATABASE_URL=sqlite+aiosqlite:///test.db` + `HOST_IP=127.0.0.1`.
- All 93 tests pass (13 pre-existing errors in `test_assignments.py` unaffected).

## Relevant Files
- `backend/app/services/config_service.py`: C1 — `_get_cached` no longer calls `create_task` from sync threads.
- `backend/app/api/v1/vms.py`: A1 — `create-lab` and `clone-range` now use `asyncio.gather` + `guestfish_semaphore`.
- `backend/app/services/iptables_service.py`: A2 — `_add_prerouting_and_output` / `_del_prerouting_and_output` use batch rules; `forward_range` / `unforward_range` batch-aware.
- `backend/app/core/libvirt/vm_manager.py`: A3 — `get_cached_if_fresh()` for hot-path fast check without thread-switch.
- `backend/app/services/vm_list_service.py`: A3 + M5 — hot-path cache check before thread-switch; removed `threading.Lock`.
- `backend/app/services/clone_service.py`: M1 — `recreate_vm` uses single volume + `os.rename` + `pool.refresh()`.
- `backend/app/services/assignment_service.py`: M2 — `batch_create` uses two `WHERE id IN (...)` queries instead of N×2 `session.get()`.
- `backend/app/services/vm_port_service.py`: M3 — removed global lock; per-VM port append.
- `backend/app/api/v1/dashboard.py`: M4 — removed `_top_consumers_lock` and `_history_lock`.
- `backend/tests/conftest.py`: Pre-existing `asyncio_default_fixture_loop_scope = session` — root cause of 13 test_assignments.py ERRORs.

---
### Archived History (Previous Sessions)
**Infra:** Frontend Docker removed, nginx host config, SSL fix, CORS expanded, SECRET_KEY rotated, EMAIL_DOMAIN → env var, Docker cleanup, deploy.sh, README.md, CHANGELOG.md.  
**RBAC & Course:** Multi-profesor ownership, course model with profesor_id FK, soft-delete, course_id on Period/Student.  
**System Parameters:** config_service.py with TTL cache, 23 params, replaces hardcoded PortMap/thresholds/defaults.  
**Performance Audit (first pass):** 9/12 N+1/double-iteration fixes, indexes.  
**Dead artifact cleanup:** Dropped vm_rules table, 7 dead schemas, frontend dead code.  
**Runtime bug fixes:** pagination extraction, Array.isArray guards, template volume creation, try/except clone_service, MySQL→SQLite portable datetime, IP address preservation, VM number off-by-one, 422 error formatting, 403 console noise, audit_log nullable user_id.  
**Earlier refactoring:** Toast system, decomposition, data hooks, union types, ErrorBoundary, skeletons, modal a11y, env vars, AbortController, testing setup.
