import { useState, useEffect, useRef } from 'react'
import { api } from '../services/api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useToast } from '../hooks/useToast'
import type { UserResponse, UserCreate, UserUpdate } from '../types'
import ContentHeader from '../components/ContentHeader'
import { TableSkeleton } from '../components/Skeleton'

export default function Users() {
  const { addToast } = useToast()
  const action = useAsyncAction()
  const [users, setUsers] = useState<UserResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState<'create' | 'edit' | null>(null)
  const [editUser, setEditUser] = useState<UserResponse | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [form, setForm] = useState({ username: '', password: '', full_name: '', email: '', role_name: 'profesor' })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const loadUsers = async () => {
      setLoading(true)
      try {
        const data = await api.users.list({ signal: controller.signal })
        if (controller.signal.aborted) return
        setUsers(data)
        setError('')
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Error al cargar usuarios')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadUsers()
    return () => controller.abort()
  }, [])

  const openCreate = () => {
    setForm({ username: '', password: '', full_name: '', email: '', role_name: 'profesor' })
    setShowModal('create')
  }

  const openEdit = (u: UserResponse) => {
    setForm({ username: u.username, password: '', full_name: u.full_name, email: u.email, role_name: u.role_name })
    setEditUser(u)
    setShowModal('edit')
  }

  const handleSave = async () => {
    setError('')
    await action.execute('save-user', async () => {
      try {
        if (showModal === 'create') {
          const body: UserCreate = {
            username: form.username,
            password: form.password,
            full_name: form.full_name,
            email: form.email || undefined,
            role_name: form.role_name,
          }
          await api.users.create(body)
          addToast('success', 'Usuario creado correctamente')
        } else if (editUser) {
          const body: UserUpdate = {
            username: form.username || undefined,
            full_name: form.full_name || undefined,
            email: form.email || undefined,
            role_name: form.role_name,
            ...(form.password ? { password: form.password } : {}),
          }
          await api.users.update(editUser.id, body)
          addToast('success', 'Usuario actualizado correctamente')
        }
        setShowModal(null)
        setEditUser(null)
        abortRef.current?.abort()
        const loadController = new AbortController()
        abortRef.current = loadController
        const data = await api.users.list({ signal: loadController.signal })
        if (!loadController.signal.aborted) setUsers(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al guardar')
      }
    })
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    await action.execute(`delete-user-${deleteId}`, async () => {
      try {
        await api.users.delete(deleteId)
        addToast('success', 'Usuario eliminado correctamente')
        setDeleteId(null)
        abortRef.current?.abort()
        const loadController = new AbortController()
        abortRef.current = loadController
        const data = await api.users.list({ signal: loadController.signal })
        if (!loadController.signal.aborted) setUsers(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al eliminar')
      }
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <ContentHeader title="Usuarios" icon="fa-users-gear" />
        <TableSkeleton rows={5} cols={6} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ContentHeader title="Usuarios" icon="fa-users-gear">
        <button
          onClick={openCreate}
          className="bg-slate-800 text-white px-4 py-2 rounded text-sm hover:bg-slate-700"
        >
          <i className="fas fa-plus mr-1"></i>Crear Usuario
        </button>
      </ContentHeader>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
          {error} <button onClick={() => setError('')} className="float-right font-bold">&times;</button>
        </div>
      )}

      {users.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 text-center">
          <i className="fas fa-users text-3xl text-slate-300 mb-2"></i>
          <p className="text-sm text-slate-500">No hay usuarios registrados</p>
        </div>
      ) : (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
            <tr>
              <th className="text-left px-4 py-3">Usuario</th>
              <th className="text-left px-4 py-3">Nombre</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Rol</th>
              <th className="text-left px-4 py-3">Creado</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3">{u.full_name}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    u.role_name === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {u.role_name === 'admin' ? 'Admin' : 'Profesor'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openEdit(u)}
                    className="text-slate-500 hover:text-slate-700 mr-2"
                    title="Editar"
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  <button
                    onClick={() => setDeleteId(u.id)}
                    className="text-red-500 hover:text-red-700"
                    title="Eliminar"
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>)}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              {showModal === 'create' ? 'Crear Usuario' : 'Editar Usuario'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Usuario</label>
                <input type="text" value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo</label>
                <input type="text" value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Rol</label>
                <select value={form.role_name}
                  onChange={e => setForm(f => ({ ...f, role_name: e.target.value }))}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                  <option value="profesor">Profesor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {showModal === 'create' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña</label>
                  <input type="password" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                </div>
              )}
              {showModal === 'edit' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nueva Contraseña <span className="text-slate-400 font-normal">(opcional)</span></label>
                  <input type="password" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Dejar en blanco para mantener actual"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setShowModal(null); setEditUser(null) }}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={action.isLoading('save-user') ? undefined : handleSave} disabled={action.isLoading('save-user')}
                  className="px-4 py-2 text-sm text-white bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50">
                  {action.isLoading('save-user') ? <><i className="fas fa-spinner animate-spin mr-2"></i>Guardando...</> : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Eliminar usuario</h2>
            <p className="text-sm text-slate-600 mb-4">¿Estás seguro de eliminar este usuario?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={deleteId !== null && action.isLoading(`delete-user-${deleteId}`) ? undefined : handleDelete}
                disabled={deleteId !== null && action.isLoading(`delete-user-${deleteId}`)}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50">
                {deleteId !== null && action.isLoading(`delete-user-${deleteId}`) ? <><i className="fas fa-spinner animate-spin mr-2"></i>Eliminando...</> : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
