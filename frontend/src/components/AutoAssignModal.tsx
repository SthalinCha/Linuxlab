import type { AutoAssignPreview, AutoAssignResult } from '../types'

interface Props {
  open: boolean
  preview: AutoAssignPreview | null
  result: AutoAssignResult | null
  loading: boolean
  executing: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function AutoAssignModal({
  open, preview, result, loading, executing,
  onConfirm, onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <i className="fas fa-magic text-indigo-600"></i>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {result ? 'Asignación Completada' : 'Vista Previa de Asignación'}
            </h2>
            <p className="text-sm text-slate-500">
              {result
                ? `${result.created} estudiante${result.created !== 1 ? 's' : ''} asignado${result.created !== 1 ? 's' : ''}`
                : 'Revisa las asignaciones propuestas antes de confirmar'}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <i className="fas fa-spinner fa-spin text-3xl text-indigo-400 mb-3"></i>
              <p className="text-sm text-slate-500">Generando asignaciones...</p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm border ${
                result.unassigned_students > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                <i className={`mt-0.5 fas ${result.unassigned_students > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i>
                <span>
                  <strong>{result.created}</strong> estudiante{result.created !== 1 ? 's' : ''} asignado{result.created !== 1 ? 's' : ''}
                  {result.unassigned_students > 0 && (
                    <span className="ml-1">
                      ({result.unassigned_students} sin VM disponible{result.unassigned_students !== 1 ? 's' : ''})
                    </span>
                  )}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {result.assignments.map((a, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                    <span className="font-medium text-slate-800">{a.student}</span>
                    <i className="fas fa-arrow-right text-slate-300 text-xs"></i>
                    <span className="font-mono text-sm font-semibold text-indigo-600">{a.vm}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview && !loading && (
            <div className="space-y-4">
              {preview.total_unassigned === 0 && preview.assignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <i className="fas fa-users-slash text-4xl text-slate-300 mb-3"></i>
                  <p className="text-sm font-medium text-slate-500">No existen estudiantes en este período</p>
                  <p className="text-xs text-slate-400 mt-1">Importa estudiantes desde la página de Estudiantes para comenzar</p>
                </div>
              ) : preview.total_unassigned > 0 && preview.assignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <i className="fas fa-exclamation-triangle text-4xl text-amber-300 mb-3"></i>
                  <p className="text-sm font-medium text-slate-600">No hay VMs disponibles para asignar</p>
                  <p className="text-xs text-slate-400 mt-1">{preview.total_unassigned} estudiante{preview.total_unassigned !== 1 ? 's' : ''} sin asignación</p>
                </div>
              ) : (
                <>
                  <div className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm border ${
                    preview.unassigned_students > 0
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-blue-50 border-blue-200 text-blue-700'
                  }`}>
                    <i className={`mt-0.5 fas ${preview.unassigned_students > 0 ? 'fa-triangle-exclamation' : 'fa-circle-info'}`}></i>
                    <span>
                      <strong>{preview.assignments.length}</strong> asignación{preview.assignments.length !== 1 ? 'es' : ''} propuesta{preview.assignments.length !== 1 ? 's' : ''}
                      {preview.unassigned_students > 0 && (
                        <span className="ml-1">
                          — <strong>{preview.unassigned_students}</strong> estudiante{preview.unassigned_students !== 1 ? 's' : ''} quedar{preview.unassigned_students !== 1 ? 'n' : 'á'} sin VM
                        </span>
                      )}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {preview.assignments.map((a, i) => (
                      <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                        <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                        <span className="font-medium text-slate-800">{a.student}</span>
                        <i className="fas fa-arrow-right text-slate-300 text-xs"></i>
                        <span className="font-mono text-sm font-semibold text-indigo-600">{a.vm}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          {result ? (
            <button onClick={onCancel}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 transition-all">
              <i className="fas fa-check"></i>
              Cerrar
            </button>
          ) : (
            <>
              <button onClick={onCancel}
                disabled={executing}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50">
                Cancelar
              </button>
              {preview && preview.assignments.length > 0 && (
                <button onClick={onConfirm}
                  disabled={executing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 transition-all disabled:opacity-50">
                  {executing ? (
                    <><i className="fas fa-spinner fa-spin"></i> Asignando...</>
                  ) : (
                    <><i className="fas fa-check"></i> Confirmar Asignación</>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
