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
- **M3 (MEDIUM — FALSE POSITIVE):** Port lock analysis: `_port_lock` is an asyncio.Lock that serializes host-port allocation. Lock IS needed for correctness (prevents two concurrent requests from assigning same host port). Per-process scope is acceptable; cross-worker host-port conflicts are a separate concern. Lock retained.
- **M4 (MEDIUM):** Removed `_top_consumers_lock` and `_history_lock` in dashboard endpoints — inner collector already has `_vm_stats_lock` and `_lock`. Eliminates lock contention on every dashboard call.
- **M5 (MEDIUM):** Removed `threading.Lock` from `_cpu_cache` in `vm_list_service` — all access is from a single event-loop thread; plain dict operations are safe.
- **C2 (CRITICAL):** Moved `_detect_distro` inside the `guestfish_semaphore` context manager in `_customize_guest`. Prevents concurrent guestfish calls from stacking up outside the semaphore limit.
- **C4 (CRITICAL):** Added `useMemo` around `filteredVms` in `VMs.tsx` to avoid recomputation on every render when dependencies haven't changed.
- **H1 (HIGH):** Wrapped all blocking `psutil` and `subprocess.run` calls in `host.py` inside `asyncio.to_thread()` — `uname -a`, `hostname -I`, `psutil.net_if_addrs()`, `psutil.swap_memory()`, `psutil.cpu_count()`. Prevents event-loop blocking on admin dashboard load.
- **H2 (HIGH):** Fixed N+1 in `list_courses` — replaced per-course `SELECT count(*)` × N with two batch `GROUP BY` queries (periods + students). 2N+1 queries → 3 total.
- **H3 (HIGH):** Fixed N+1 in `bulk_delete_assignments` — replaced per-ID `session.get()` + per-VM `session.get()` loops with batch `IN` queries. Up to 2N queries → 2.
- **H4 (HIGH):** Fixed N+1 in `undo_import` — replaced per-student `session.get()` loop with batch `IN` query. N queries → 1.
- **H10 (HIGH):** Fixed FK violation risk in `undo_import` — now deletes ALL assignments for target students (previously only current-user VMs), then batch-loads students for deletion. Eliminates `IntegrityError` from remaining FK references.
- **M1 (MEDIUM):** Removed 8 unnecessary `session.refresh()` calls after `session.commit()` with `expire_on_commit=False` — only for CREATE operations where server_default values are already fetched via RETURNING during flush. Retained `refresh()` for UPDATE operations (needed for `onupdate` on `updated_at` column).
- **M5 (MEDIUM — FALSE POSITIVE):** `_cpu_cache` cleanup already exists at `vm_list_service.py:69-72` — stale entries purged on every `list_vms` call. No changes needed.
- **M12 (MEDIUM):** Optimized entrypoint DB wait — replaced heavy `python -c "from app.database.session import engine; SELECT 1"` per-iteration (~2s Python import cold) with lightweight TCP socket connect for MySQL, file-existence check for SQLite. Startup time reduced from ~60s to ~1s on cold DB.
- **L1 (LOW):** Fixed broken menu outside-click handler in `VMTable.tsx` — `menuRef` was created in `VMs.tsx` but never attached to any DOM element. Moved ref + click-detection `useEffect` into `VMTable` where the menu `<div>` is rendered. Menu now correctly closes on outside click.
- **L4 (LOW):** Removed unused `alembic==1.13.2` from `requirements.txt`.
- **C8 (CRITICAL):** Created `backend/.dockerignore` excluding `__pycache__`, `.db`, `tests`, `venv`, `.git`, `migrations`, `scripts` — reduces Docker build context size.
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
- **`session.refresh()` after commit with `expire_on_commit=False`:** Only unnecessary for CREATE operations (server_default values are fetched via RETURNING during flush). Refreshes retained for UPDATE operations where `onupdate` fires on `updated_at` — without refresh, the async ORM cannot lazy-load the column value in Pydantic's sync `model_validate()` context (MissingGreenlet).

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
- `backend/app/services/clone_service.py`: C2 — `_detect_distro` moved inside `guestfish_semaphore`. M1 — `recreate_vm` uses single volume + `os.rename` + `pool.refresh()`.
- `backend/app/services/assignment_service.py`: M2 — `batch_create` uses two `WHERE id IN (...)` queries instead of N×2 `session.get()`.
- `backend/app/services/vm_port_service.py`: M3 — lock retained (needed for correctness).
- `backend/app/api/v1/dashboard.py`: M4 — removed `_top_consumers_lock` and `_history_lock`.
- `backend/app/api/v1/courses.py`: H2 — batch `GROUP BY` queries for period/student counts.
- `backend/app/api/v1/assignments.py`: H3 — batch `IN` query for bulk delete.
- `backend/app/api/v1/students.py`: H4 + H10 — batch student query + delete all assignments in undo_import.
- `backend/app/api/v1/host.py`: H1 — all psutil/subprocess calls wrapped in `to_thread`.
- `backend/app/services/host_service.py`: H1 — async wrapper for host metrics.
- `backend/frontend/src/pages/VMs.tsx`: C4 — `useMemo` for filteredVms.
- `backend/frontend/src/components/VMTable.tsx`: L1 — menu outside-click handler with proper ref attachment.
- `backend/entrypoint.sh`: M12 — lightweight TCP/file check instead of heavy SQLAlchemy import.
- `backend/requirements.txt`: L4 — removed `alembic`.
- `backend/.dockerignore`: C8 — new file.
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
