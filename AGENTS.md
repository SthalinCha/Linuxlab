## Goal
Multi-profesor RBAC: cada profesor ve solo sus VMs, estudiantes y asignaciones. Numeración global secuencial de VMs. Aislamiento completo entre profesores.

## Constraints & Preferences
- Profesor via endpoint `profesor_only`; admin via `admin_only` o `admin_profesor`.
- Ownership validation explícita en cada operación CRUD (no confiar solo en list filter).
- Backend Docker requiere rebuild (`docker compose build backend && docker compose up -d backend`).
- Frontend Vite HMR en host para desarrollo rápido.

## Progress
### Done
- **Phase 0 (Quick Wins):** Registered `/students` and `/audit` routes; added nav links in `Layout.tsx`; removed 6 unused interfaces from `types/index.ts`; removed dead `api.iptables` namespace; removed 3 unused FA deps; enabled `noUnusedLocals` + `noUnusedParameters` in `tsconfig.json`; fixed 6 compilation errors
- **Phase 1 (Shared Toast System):** Created `hooks/useToast.tsx` with `ToastProvider` + `useToast()`; wrapped `main.tsx`; replaced ~100 LOC of duplicated toast logic across VMs, Assignments, Students
- **Phase 2 (Decomposition):** `Layout.tsx` 303→148 LOC (ChangePasswordModal, CreateAdminModal); `VMs.tsx` 908→349 LOC (VMStats, VMToolbar, VMTable, VMModals, VmModal, IconButton); `Assignments.tsx` 817→260 LOC (AssignmentStats, AssignmentToolbar, AssignmentTable, AssignmentHistory)
- **Phase 3 (Data-fetching hooks):** Created `hooks/useStudents.ts`, `useVMs.ts`, `useAssignments.ts`, `useDashboard.ts`; integrated into page components; removed inline fetch/loading/error boilerplate
- **Phase 4a (Union types):** Added `VMState` type; typed `VirtualMachine.current_state` as `VMState`; expanded `toVMStatus()`; typed `stateColors`/`stateDots`
- **Phase 4b (Error boundary):** Created `components/ErrorBoundary.tsx`; wrapped all 7 protected routes in `App.tsx`
- **Phase 4c (Loading skeletons):** Created `components/Skeleton.tsx` (`SkeletonBar`, `TableSkeleton`, `StatsSkeleton`); replaced spinners in VMTable, AssignmentTable, Students, AssignmentHistory, Dashboard
- **Phase 4d (Modal accessibility):** Updated `ConfirmModal.tsx` with ARIA attributes, Escape key, auto-focus
- **Phase 5a (Env variables):** `api.ts` reads `VITE_API_URL` env with fallback `/api/v1`; created `src/vite-env.d.ts`
- **Phase 5b (AbortController):** `request()` accepts optional `AbortSignal`; all API methods accept `opts?: { signal?: AbortSignal }`; all 4 hooks create/abort controllers on mount
- **Phase 5c (Testing setup):** Installed `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`; added `test` config to `vite.config.ts`; `src/test/setup.ts`; 4/4 passing tests for `SkeletonBar` and `TableSkeleton`
- **Runtime bug fixes:**
  - Backend pagination `{items, total, limit, offset}` — added `.items` extraction in all API list methods
  - Added `Array.isArray()` guards in hooks and page components
  - Deleted dead `public/assignments.html` from git tracking
  - Removed old `dist/` build artifacts
  - Created `ubuntu-server-main.qcow2` template volume (was missing, causing 500 on clone/recreate/start)
  - Added comprehensive `try/except` error handling in `clone_service.py` for all libvirt operations
  - Fixed `base.py`: replaced MySQL-only `ON UPDATE CURRENT_TIMESTAMP` with portable `func.now()` + `onupdate` (fixes SQLite startup)
  - Fixed `sync_vms.py`: `sync_libvirt_domains()` called on every `GET /vms` was overwriting `ip_address` with empty string (libvirt returns no DHCP lease for shut-off VMs). Now preserves existing IPs and computes fallback `192.168.122.{num}` from VM name
  - Fixed `VMs.tsx`: `handleAddVmConfirm` used `Math.max(...nums)` (current max) instead of `Math.max(...nums) + 1` (next available), causing clone-conflict 409 errors
  - Rebuilt Docker `linuxlab-backend` container — all backend services run in Docker, host-side file edits don't apply until rebuild
  - Fixed `api.ts`: array `detail` from FastAPI 422 errors now joined via `e.msg` instead of producing `[object Object]`
  - Fixed `Layout.tsx`: guarded `api.host.get()` with `if (!isAdmin) return` to avoid 403 console noise
  - Fixed audit_logs: migration `004` made `user_id` nullable (fixes 500 on login)
- **Git cleanup:** Added `.opencode/`, `.vite/`, `tsconfig.tsbuildinfo`, `linuxlab.db` to `.gitignore`; removed tracking via `git rm --cached`
- **Phase 6 (RBAC — multi-professor):** Backend: `owner_id` FK on VMs, `created_by` FK on Students; all CRUD endpoints enforce ownership filtering for profesor role; `_get_vm_or_404()` helper with 403 for unauthorized access; iptables GET open to profesor, write ops admin-only. Frontend: bug fixes for 422 display and 403 noise. DB migrations `004` (nullable user_id) and `005` (owner/creator columns). Two test users: `admin`/`linuxlab` (role=admin) and `prof1`/`password123` (role=profesor). All 26 files committed in `7ebad91`.
- **Seguridad Fase 1 (ownership checks completas):** `students.py`: `_get_student_or_404()` helper, get/put/delete/undo-import scoped por `created_by`. `assignment_service.py`: ownership en validate/release/bulk_release/batch_create/close_period. `assignments.py`: `GET /periods` filtra por `vm.has(owner_id)`. `periods.py`: close_period pasa `user_id`. `vms.py`: recreate-range salta VMs ajenas. `dashboard.py`: los 6 endpoints usan `admin_profesor` y filtran VMs/activity por `owner_id`/`admin_username` para profesor. Docker rebuild + verificación completa.
- **Fase 2 (Modelo Course):** `backend/app/models/course.py`: modelo Course con `profesor_id`, `name`, `code`, `description`. `course_id` FK añadido a `Period` y `Student`. Migraciones 006-008 (courses table + columnas). Router `GET/POST/PUT/DELETE /courses` protegido por `profesor_only` con ownership scoping. `students.py`: list filtra por `course_id`, create acepta `course_id`. `periods.py`: list filtra por `course_id`. Frontend: Courses page eliminada (solo backend). NavLink + route removidos. TypeScript 0 errores, build OK, tests 4/4, Docker rebuild + verificación.

- **Fase 3 (Dead artifact cleanup):** Dropped orphan `vm_rules` DB table (no model, no endpoints, 0 rows). Deleted 7 dead schema files (`role`, `period`, `vm_template`, `vm_assignment`, `vm_state_history`, `audit_log`, `system_parameter`), stale `__pycache__/vm_rule.cpython-314.pyc`, and cleaned `schemas/__init__.py`. Frontend: removed `CreateAdminModal.tsx`, `useStudents.ts`, 10 dead API methods (`auth.register`, `ports.add`, `vms.recreateRange`, `assignments.autoAssign`, `assignments.batchCreate`, `students.create`, `students.update`, `students.history`, `users.me`, `users.get`). Removed unused types `AddPortRequest`, `AdminCreateRequest`, `AdminCreateResponse`. Migration `009_drop_vm_rules.sql`.

### In Progress
- (none)

### Blocked
- Numeración de VMs legacy: VMs existentes pueden tener owner NULL, no bloquea pero hay que asignar manualmente.
- Integración completa de course selector en Assignments y Students (actualmente solo filtran por course_id via query param pero no hay UI selector).

## Key Decisions
- Numeración de VMs global (backend es única fuente de verdad, `GET /vms/next-number`), no por profesor.
- `recreate-range`: VMs ajenas saltan silenciosamente (no 403).
- `close_period`: período global se cierra, pero solo se liberan asignaciones del profesor que ejecuta la acción.
- Dashboard para profesor: health_score es global (host-level), solo VMs/activity scoped.
- `created_by=NULL` en students legacy se trata como no-propietario (profesor recibe 403).
- Course model: soft-delete lógico, course_id en Period/Student nullable para backward compat.
- Backend en Docker; cambios requieren rebuild.

## Next Steps
1. Course selector UI en Assignments y Students pages.
2. Frontend visual indicators de ownership (opcional).

## Critical Context
- Build: `tsc -b && vite build` — ambos OK. Tests: `vitest run` — 4/4.
- Backend Docker en `:8000`; rebuild: `docker compose build backend && docker compose up -d backend`.
- FastAPI endpoints protegidos: `profesor_only` (assignments, students, periods, courses), `admin_only` (users, host, network), `admin_profesor` (dashboard, vms).
- 14 VMs (admin ve todas, prof1 ve 0 sin owner_id). 11 students (admin ve 0 via 403, prof1 ve 0 via filter). 4 periods. 2 cursos creados+1 soft-deleted por prof1.
- Course API: GET/POST/PUT/DELETE `/courses` con ownership por `profesor_id`.
- Students list soporta `?course_id=N`. Periods list soporta `?course_id=N`.
- `_get_student_or_404()`: 404 si no existe, 403 si profesor y `created_by != user.id`.

## Relevant Files
- `backend/app/models/course.py`: modelo Course con `profesor_id`.
- `backend/app/schemas/course.py`: `CourseCreate`, `CourseUpdate`, `CourseResponse`, `CourseWithCounts`.
- `backend/app/api/v1/courses.py`: CRUD con `profesor_only` + ownership.
- `backend/app/api/v1/vms.py`: `_get_vm_or_404()` helper; `GET /vms/next-number`; recreate-range skip por ownership.
- `backend/app/api/v1/students.py`: `_get_student_or_404()` helper; get/put/delete/undo-import scoped; course_id support.
- `backend/app/api/v1/assignments.py`: GET /periods scoped; create/release/batch pasan `user` al service.
- `backend/app/api/v1/periods.py`: close_period pasa `user_id`; list soporta `?course_id`.
- `backend/app/api/v1/dashboard.py`: `admin_profesor` en 6 endpoints; owner_id filter en VMs.
- `backend/app/services/assignment_service.py`: ownership en validate/release/bulk_release/batch_create/close_period.
- `backend/migrations/006_courses.sql`, `007_periods_course_id.sql`, `008_students_course_id.sql`, `009_drop_vm_rules.sql`.
- `frontend/src/pages/VMs.tsx`: next-number via endpoint en add/lab modal.
