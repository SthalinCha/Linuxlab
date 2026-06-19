# Módulo de Gestión de Usuarios

## Resumen
Agregar página "Usuarios" solo para ADMIN, con CRUD completo + gestión de roles/estado/contraseñas.  
El menú se adapta según el rol (PROFESSOR ve menos opciones).

---

## Backend

### 1. `backend/app/api/v1/users.py` — NUEVO
Todos los endpoints protegidos con `require_admin()`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/users` | Lista todos los usuarios activos (no eliminados) con rol eager-loaded |
| `GET` | `/users/{id}` | Usuario individual |
| `POST` | `/users` | Crear usuario (username, password, full_name, email, role_id) |
| `PUT` | `/users/{id}` | Actualizar usuario (campos opcionales) |
| `PATCH` | `/users/{id}/role` | Cambiar rol (role_id) |
| `PATCH` | `/users/{id}/status` | Activar/desactivar (soft delete / restore) |
| `POST` | `/users/{id}/reset-password` | Resetear contraseña (new_password) |

### 2. `backend/app/api/v1/auth.py` — MODIFICAR
- `TokenResponse` agrega `role_name: str` y `full_name: str`
- Login carga el usuario + rol, devuelve `role_name` y `full_name`

### 3. `backend/app/schemas/user.py` — MODIFICAR
- `UserResponse` agrega `role_name: str`
- Agregar `ResetPasswordRequest(BaseModel)` con `new_password: str` (min 8)

### 4. `backend/app/main.py` — MODIFICAR
- Importar `users` router
- `app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])`

### 5. `backend/app/schemas/__init__.py` — MODIFICAR
- Exportar `ResetPasswordRequest`

---

## Frontend

### 1. `frontend/src/types/index.ts` — MODIFICAR
```typescript
export interface User {
  id: number
  username: string
  full_name: string
  email: string
  role_id: number
  role_name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateUserRequest {
  username: string
  password: string
  full_name: string
  email: string
  role_id: number
}

export interface UpdateUserRequest {
  username?: string
  full_name?: string
  email?: string
  role_id?: number
}

export interface ResetPasswordRequest {
  new_password: string
}
```

### 2. `frontend/src/services/api.ts` — MODIFICAR
- Agregar `api.users` con métodos: list, get, create, update, changeRole, toggleStatus, resetPassword
- Importar nuevos tipos
- Modificar `TokenResponse` para incluir `role_name` y `full_name`

### 3. `frontend/src/hooks/useUsers.ts` — NUEVO
Hook siguiendo el patrón de `useStudents.ts`:
- `useUsers()` → `{ users, loading, error, refresh, createUser, updateUser, ... }`
- AbortController en mount/cleanup

### 4. `frontend/src/pages/Users.tsx` — NUEVO
Página completa de gestión de usuarios:
- **Header:** "Usuarios" + botón "Crear Usuario"
- **Tabla con columnas:** Usuario, Nombre, Email, Rol (badge), Estado (badge), Acciones
- **Botón Crear** → modal inline con: username, password, full_name, email, role selector (select con ADMIN/PROFESSOR)
- **Acciones por fila:** Editar (modal), Reset Password (modal), Activar/Desactivar (ConfirmModal)
- **Estados:** Activo = verde "Activo", Inactivo = rojo "Inactivo"
- **Roles:** ADMIN = badge slate, PROFESSOR = badge blue
- Skeleton loading, error state siguiendo patrón existente

### 5. `frontend/src/pages/Login.tsx` — MODIFICAR
- Guardar `admin_role` y `admin_full_name` en localStorage desde respuesta del login
- `localStorage.setItem('admin_role', res.role_name)`
- `localStorage.setItem('admin_full_name', res.full_name)`

### 6. `frontend/src/components/Layout.tsx` — MODIFICAR
- Leer `admin_role` de localStorage
- Filtrar `navItems` según rol:
  - **ADMIN:** Dashboard, Instancias, Asignaciones, Accesos, Estudiantes, **Usuarios**, Auditoría, Host
  - **PROFESSOR:** Dashboard, Instancias, Asignaciones, Estudiantes
- En dropdown, ocultar "Agregar Admin" si no es admin
- Al cerrar sesión, limpiar `admin_role` y `admin_full_name`

### 7. `frontend/src/App.tsx` — MODIFICAR
- Importar `Users` page
- Agregar `<Route path="users" element={<ErrorBoundary><Users /></ErrorBoundary>} />`

---

## Seguridad
- Backend: todos los endpoints usan `require_admin()` — si PROFESSOR intenta llamarlos, recibe 403
- Frontend: el nav item "Usuarios" no se renderiza para PROFESSOR (no pueden verlo ni navegar a `/users`)
- Si PROFESSOR navega manualmente a `/users`, el backend devuelve 403 y el frontend muestra error

## Archivos modificados (14)
| Archivo | Cambio |
|---------|--------|
| `backend/app/api/v1/users.py` | **NUEVO** — 7 endpoints CRUD |
| `backend/app/api/v1/auth.py` | Modificar TokenResponse + login |
| `backend/app/schemas/user.py` | + role_name en UserResponse, + ResetPasswordRequest |
| `backend/app/schemas/__init__.py` | + ResetPasswordRequest export |
| `backend/app/main.py` | + users router |
| `frontend/src/types/index.ts` | + User, CreateUserRequest, UpdateUserRequest |
| `frontend/src/services/api.ts` | + api.users methods |
| `frontend/src/hooks/useUsers.ts` | **NUEVO** — data-fetching hook |
| `frontend/src/pages/Users.tsx` | **NUEVO** — full user management page |
| `frontend/src/pages/Login.tsx` | + store role + full_name |
| `frontend/src/components/Layout.tsx` | Filtrar nav por rol, ocultar "Agregar Admin" |
| `frontend/src/App.tsx` | + /users route |
