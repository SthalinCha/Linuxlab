## Goal
Migrate frontend from legacy React patterns to modern architecture (shared hooks, component decomposition, dead code cleanup).

## Constraints & Preferences
- Incremental migration per phase (no big-bang rewrite)
- Extract shared logic into hooks/contexts before decomposing components
- Enable strict TypeScript (`noUnusedLocals`, `noUnusedParameters`)
- Sub-components in `components/` folder with clear prop interfaces
- Vite dev server accessible on LAN at `http://192.168.18.21:5173/` (host `0.0.0.0`)

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

### In Progress
- **Phase 6 (RBAC):** Sistema de roles admin/profesor implementado en backend (`RoleChecker`, CRUD usuarios, protección de endpoints) y frontend (`AuthContext`, nav filtrado, rutas protegidas, página Users). Pendiente: backend corre en Docker, necesita rebuild del container para aplicar cambios. Falta definir permisos de profesor en VMs/Assignments.

### Blocked
- (none)

## Key Decisions
- Pivot from backend maintenance to frontend modernization per user request
- Deferred `PortForwardGrid.tsx` toast unification — its inline notification pattern differs from floating toasts
- Rejected `clearError` on hooks in favor of transient error display
- Used class component for `ErrorBoundary` since React 18 has no hooks equivalent
- Backend pagination handled by extracting `.items` at the API method layer
- Vite dev server configured with `host: '0.0.0.0'` for LAN access

## Next Steps
- (awaiting new tasks)

## Critical Context
- Build: `tsc -b && vite build` — both pass (872 modules)
- Tests: `vitest run` — 4/4 passing
- Dev server: `http://192.168.18.21:5173/` (proxy `/api` → `localhost:8000`)
- Backend: uvicorn on `:8000` (opencode-managed)
- React 18.3 + TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`)
- `VMState` = `'running' | 'shut off' | 'paused' | 'crashed' | 'unknown'` (raw libvirt); `VMStatus` = `'running' | 'shutoff'` (simplified display)
- Backend returns paginated `{items: T[], total, limit, offset}` — frontend unwraps `.items` in each API method
- libvirt available, daemon running, template volume `ubuntu-server-main.qcow2` created

## Relevant Files
- `src/hooks/useStudents.ts`, `useVMs.ts`, `useAssignments.ts`, `useDashboard.ts`: data-fetching hooks with AbortController + defensive array guards
- `src/services/api.ts`: reads `VITE_API_URL`, accepts `AbortSignal`, extracts `.items` from paginated responses
- `src/components/Skeleton.tsx`, `ErrorBoundary.tsx`, `ConfirmModal.tsx`: accessible UI components
- `src/pages/Assignments.tsx`: 260 LOC orchestrator; `src/pages/VMs.tsx`: 349 LOC orchestrator
- `backend/app/services/clone_service.py`: comprehensive libvirt error handling
- `backend/app/models/base.py`: portable `updated_at` column definition
