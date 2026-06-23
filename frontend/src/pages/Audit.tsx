import { useState, useEffect } from 'react'
import { api } from '../services/api'
import type { AuditLog } from '../types'
import ContentHeader from '../components/ContentHeader'

const typeColors: Record<string, string> = {
  login: 'bg-blue-100 text-blue-800',
  login_failed: 'bg-red-100 text-red-800',
  vm_start: 'bg-green-100 text-green-800',
  vm_shutdown: 'bg-yellow-100 text-yellow-800',
  vm_reboot: 'bg-orange-100 text-orange-800',
  vm_destroy: 'bg-red-100 text-red-800',
  vm_clone: 'bg-purple-100 text-purple-800',
  vm_recreate: 'bg-indigo-100 text-indigo-800',
  vm_delete: 'bg-red-100 text-red-800',
  student_create: 'bg-teal-100 text-teal-800',
  student_update: 'bg-blue-100 text-blue-800',
  student_deactivate: 'bg-red-100 text-red-800',
  student_import: 'bg-cyan-100 text-cyan-800',
  assignment_create: 'bg-teal-100 text-teal-800',
  assignment_release: 'bg-orange-100 text-orange-800',
}

export default function Audit() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const limit = 50

  const loadLogs = async () => {
    setLoading(true)
    try {
      const res = await api.audit.list(filter || undefined, limit, page * limit)
      setLogs(res.items)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(0)
    loadLogs()
  }, [filter])

  return (
    <div className="space-y-4">
      <ContentHeader title="Auditoría" icon="fa-clipboard-list">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-slate-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">Todos los eventos</option>
          <option value="login">Login</option>
          <option value="vm_start">Inicio VM</option>
          <option value="vm_shutdown">Apagado VM</option>
          <option value="vm_clone">Clonación</option>
          <option value="vm_recreate">Recreación</option>
          <option value="vm_delete">Eliminación</option>
          <option value="assignment_create">Asignación</option>
          <option value="assignment_release">Liberación</option>
        </select>
      </ContentHeader>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-12">Cargando...</div>
      ) : (
        <>
          <div className="text-sm text-slate-500 mb-2">
            {total} eventos (página {page + 1}, {limit} por página)
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">Administrador</th>
                  <th className="text-left px-4 py-3">Acción</th>

                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          typeColors[log.event_type] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {log.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{log.admin_username}</td>
                    <td className="px-4 py-3">{log.action}</td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center">
            <button
              onClick={() => { setPage(p => Math.max(0, p - 1)); loadLogs() }}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm bg-slate-100 rounded disabled:opacity-50 hover:bg-slate-200"
            >
              Anterior
            </button>
            <span className="text-sm text-slate-500">
              Página {page + 1} de {Math.max(1, Math.ceil(total / limit))}
            </span>
            <button
              onClick={() => { setPage(p => p + 1); loadLogs() }}
              disabled={(page + 1) * limit >= total}
              className="px-3 py-1.5 text-sm bg-slate-100 rounded disabled:opacity-50 hover:bg-slate-200"
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  )
}
