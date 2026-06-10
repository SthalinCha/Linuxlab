import { useState, useEffect, FormEvent, useRef } from 'react'
import { api } from '../services/api'
import type { Student, VMAssignment } from '../types'

interface Toast {
  id: number
  type: 'loading' | 'success' | 'error' | 'warning'
  message: string
}

let toastIdCounter = 0

export default function Students() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [formData, setFormData] = useState({ full_name: '', email: '', student_code: '' })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null)
  const [history, setHistory] = useState<{ student: Student; assignments: VMAssignment[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addToast = (type: Toast['type'], message: string) => {
    const id = ++toastIdCounter
    setToasts(prev => [...prev, { id, type, message }])
    if (type !== 'loading') {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
    }
  }

  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id))

  const loadStudents = async () => {
    setLoading(true)
    try {
      const data = await api.students.list(search || undefined)
      setStudents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar estudiantes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStudents() }, [search])

  const resetForm = () => {
    setFormData({ full_name: '', email: '', student_code: '' })
    setEditing(null)
    setShowForm(false)
  }

  const openEdit = (s: Student) => {
    setFormData({ full_name: s.full_name, email: s.email, student_code: s.student_code })
    setEditing(s)
    setShowForm(true)
    setHistory(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    addToast('loading', editing ? 'Actualizando estudiante...' : 'Creando estudiante...')
    try {
      if (editing) {
        await api.students.update(editing.id, formData)
        addToast('success', 'Estudiante actualizado')
      } else {
        await api.students.create(formData)
        addToast('success', 'Estudiante creado')
      }
      resetForm()
      await loadStudents()
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  const handleDelete = async (s: Student) => {
    addToast('loading', `Desactivando ${s.full_name}...`)
    try {
      await api.students.delete(s.id)
      addToast('success', `${s.full_name} desactivado`)
      await loadStudents()
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  const handleImportCsv = async (e: FormEvent) => {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file) return
    try {
      const result = await api.students.importCsv(file)
      setImportResult(result)
      await loadStudents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar')
    }
  }

  const showHistory = async (s: Student) => {
    try {
      const assignments = await api.students.history(s.id)
      setHistory({ student: s, assignments })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar historial')
    }
  }

  return (
    <div className="space-y-4">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[60] space-y-2 w-80">
        {toasts.map(t => (
          <div key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-l-4 ${
              t.type === 'loading' ? 'border-l-blue-500' :
              t.type === 'success' ? 'border-l-emerald-500' :
              t.type === 'warning' ? 'border-l-yellow-500' :
              'border-l-red-500'
            }`}
          >
            {t.type === 'loading' ? (
              <i className="fas fa-spinner fa-spin text-blue-500 mt-0.5"></i>
            ) : t.type === 'success' ? (
              <i className="fas fa-check-circle text-emerald-500 mt-0.5"></i>
            ) : t.type === 'warning' ? (
              <i className="fas fa-exclamation-triangle text-yellow-500 mt-0.5"></i>
            ) : (
              <i className="fas fa-times-circle text-red-500 mt-0.5"></i>
            )}
            <span className="flex-1 text-sm text-slate-700">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="text-slate-400 hover:text-slate-600 leading-none text-lg">&times;</button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Estudiantes</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); setHistory(null) }}
            className="bg-slate-800 text-white px-4 py-2 rounded text-sm hover:bg-slate-700"
          >
            {showForm ? 'Cancelar' : 'Nuevo Estudiante'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">
            {editing ? 'Editar Estudiante' : 'Nuevo Estudiante'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" placeholder="Nombre completo" value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="border border-slate-300 rounded px-3 py-2" required />
            <input type="email" placeholder="Email" value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="border border-slate-300 rounded px-3 py-2" required />
            <input type="text" placeholder="Código" value={formData.student_code}
              onChange={(e) => setFormData({ ...formData, student_code: e.target.value })}
              className="border border-slate-300 rounded px-3 py-2" required />
            <div className="md:col-span-3 flex gap-2">
              <button type="submit"
                className="bg-slate-800 text-white px-4 py-2 rounded text-sm hover:bg-slate-700">
                {editing ? 'Actualizar' : 'Guardar'}
              </button>
              <button type="button" onClick={resetForm}
                className="bg-gray-200 text-slate-700 px-4 py-2 rounded text-sm hover:bg-gray-300">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {importResult && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded text-sm">
          <strong>Importación:</strong> {importResult.created} creados
          {importResult.errors.length > 0 && (
            <ul className="mt-1 list-disc list-inside">
              {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              {importResult.errors.length > 5 && <li>...y {importResult.errors.length - 5} más</li>}
            </ul>
          )}
          <button onClick={() => setImportResult(null)} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      {history && (
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">
              Historial: {history.student.full_name}
            </h2>
            <button onClick={() => setHistory(null)}
              className="text-sm text-slate-500 hover:text-slate-700">Cerrar</button>
          </div>
          {history.assignments.length === 0 ? (
            <p className="text-slate-500">Sin asignaciones previas</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2">VM</th>
                  <th className="text-left px-4 py-2">Período</th>
                  <th className="text-left px-4 py-2">Asignada</th>
                  <th className="text-left px-4 py-2">Liberada</th>
                  <th className="text-left px-4 py-2">Recreaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                  {history.assignments.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-mono text-xs">{a.vm?.name || `VM #${a.id_vm}`}</td>
                    <td className="px-4 py-2">{a.period_name}</td>
                    <td className="px-4 py-2 text-xs">{new Date(a.assigned_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-xs">
                      {a.released_at ? new Date(a.released_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-2">{a.recreate_count}/3</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input type="text" placeholder="Buscar por nombre, email o código..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-300 rounded px-3 py-2 flex-1 max-w-md" />
        <form onSubmit={handleImportCsv} className="flex gap-2 items-center">
          <input type="file" accept=".csv" ref={fileInputRef}
            className="text-sm text-slate-500 file:mr-2 file:px-3 file:py-1.5 file:border-0 file:rounded file:text-sm file:bg-slate-100 hover:file:bg-slate-200" />
          <button type="submit"
            className="bg-green-700 text-white px-3 py-1.5 rounded text-sm hover:bg-green-800">
            Importar CSV
          </button>
        </form>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Cargando...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">Nombre</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Código</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{s.email}</td>
                  <td className="px-4 py-3 text-slate-500">{s.student_code}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {s.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(s)}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                        Editar
                      </button>
                      <button onClick={() => showHistory(s)}
                        className="px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700">
                        Historial
                      </button>
                      {s.is_active && (
                        <button onClick={() => handleDelete(s)}
                          className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">
                          Desactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
