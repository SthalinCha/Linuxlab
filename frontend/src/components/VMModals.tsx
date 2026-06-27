import type { VMTemplateInfo } from '../types'
import VmModal from './VmModal'

interface BulkAction {
  ids: number[]
  action: string
  label: string
}

interface Props {
  showLabModal: boolean
  labTemplate: string
  labCount: number
  labStart: number
  labPrefix: string
  creatingLab: boolean
  templates: VMTemplateInfo[]
  confirmDelete: number | null
  loadingDelete?: boolean
  confirmDestroy: number | null
  loadingDestroy?: boolean
  confirmRecreate: number | null
  loadingRecreate?: boolean
  confirmBulkAction: BulkAction | null
  loadingBulkAction?: boolean
  confirmBulkDelete: boolean
  loadingBulkDelete?: boolean
  confirmBulkRecreate: number[] | null
  loadingBulkRecreate?: boolean
  confirmAddVm: number | null
  creatingVm: boolean

  onLabTemplateChange: (value: string) => void
  onLabCountChange: (value: number) => void
  onLabStartChange: (value: number) => void
  onCloseLabModal: () => void
  onCreateLab: () => void

  onConfirmDelete: () => void
  onCancelDelete: () => void
  onConfirmDestroy: () => void
  onCancelDestroy: () => void
  onConfirmRecreate: () => void
  onCancelRecreate: () => void
  onConfirmBulkAction: () => void
  onCancelBulkAction: () => void
  onConfirmBulkDelete: () => void
  onCancelBulkDelete: () => void
  onConfirmBulkRecreate: () => void
  onCancelBulkRecreate: () => void
  onConfirmAddVm: () => void
  onCancelAddVm: () => void
}

export default function VMModals({
  showLabModal, labTemplate, labCount, labStart, labPrefix, creatingLab, templates,
  confirmDelete, loadingDelete, confirmDestroy, loadingDestroy,
  confirmRecreate, loadingRecreate, confirmBulkAction, loadingBulkAction,
  confirmBulkDelete, loadingBulkDelete, confirmBulkRecreate, loadingBulkRecreate,
  confirmAddVm, creatingVm,
  onLabTemplateChange, onLabCountChange, onLabStartChange, onCloseLabModal, onCreateLab,
  onConfirmDelete, onCancelDelete, onConfirmDestroy, onCancelDestroy,
  onConfirmRecreate, onCancelRecreate, onConfirmBulkAction, onCancelBulkAction,
  onConfirmBulkDelete, onCancelBulkDelete, onConfirmBulkRecreate, onCancelBulkRecreate,
  onConfirmAddVm, onCancelAddVm,
}: Props) {
  return (
    <>
      {/* Create Lab Modal */}
      {showLabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 backdrop-blur-sm bg-black/40" onClick={() => !creatingLab && onCloseLabModal()} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <i className="fas fa-rocket text-emerald-600"></i>
              </div>
              <h2 className="text-lg font-semibold text-slate-800">Crear Laboratorio</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <i className="fas fa-clone mr-1"></i>Plantilla
                </label>
                <select
                  value={labTemplate}
                  onChange={(e) => onLabTemplateChange(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                >
                  {Array.isArray(templates) && templates.map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Número de Inicio</label>
                  <input
                    type="number"
                    min={10}
                    value={labStart}
                    onChange={(e) => onLabStartChange(Math.max(10, parseInt(e.target.value) || 10))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad de Máquinas</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={labCount}
                    onChange={(e) => onLabCountChange(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                  />
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg px-4 py-3">
                <p className="text-sm text-slate-600">
                  <i className="fas fa-info-circle text-slate-400 mr-1.5"></i>
                  Se clonarán <strong>{labCount}</strong> instancias automáticamente: desde{' '}<strong>{labPrefix}-{labStart}</strong> hasta{' '}<strong>{labPrefix}-{labStart + labCount - 1}</strong>.
                </p>
              </div>

              {creatingLab && (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3">
                  <i className="fas fa-spinner fa-spin text-slate-500"></i>
                  Creando laboratorio...
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onCloseLabModal}
                disabled={creatingLab}
                className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={onCreateLab}
                disabled={creatingLab}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-40"
              >
                {creatingLab ? 'Creando...' : 'Iniciar Clonación'}
              </button>
            </div>
          </div>
        </div>
      )}

      <VmModal
        open={confirmDelete !== null}
        title="Eliminar Instancia"
        message="Esta acción destruirá los discos virtuales de la VM y no se puede deshacer."
        confirmLabel={loadingDelete ? 'Eliminando...' : 'Sí, Eliminar'}
        danger
        disabled={loadingDelete}
        icon="fa-trash-alt"
        iconBg="bg-red-100"
        iconColor="text-red-600"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />

      <VmModal
        open={confirmDestroy !== null}
        title="Forzar Apagado"
        message="Se forzará el apagado de la VM. Los datos en memoria no guardados se perderán."
        confirmLabel={loadingDestroy ? 'Apagando...' : 'Sí, Forzar Apagado'}
        danger
        disabled={loadingDestroy}
        icon="fa-exclamation-triangle"
        iconBg="bg-red-100"
        iconColor="text-red-600"
        onConfirm={onConfirmDestroy}
        onCancel={onCancelDestroy}
      />

      <VmModal
        open={confirmRecreate !== null}
        title="Recrear VM"
        message="La VM se recreará desde la plantilla. Esto no puede deshacerse."
        confirmLabel={loadingRecreate ? 'Recreando...' : 'Recrear'}
        danger
        disabled={loadingRecreate}
        icon="fa-code-branch"
        iconBg="bg-purple-100"
        iconColor="text-purple-600"
        onConfirm={onConfirmRecreate}
        onCancel={onCancelRecreate}
      />

      <VmModal
        open={!!confirmBulkAction}
        title={`${confirmBulkAction ? confirmBulkAction.label.charAt(0).toUpperCase() + confirmBulkAction.label.slice(1) : ''} ${confirmBulkAction?.ids.length ?? 0} VM(s)?`}
        message={`Se va a ${confirmBulkAction?.label || 'ejecutar'} en ${confirmBulkAction?.ids.length ?? 0} VM(s).`}
        confirmLabel={loadingBulkAction ? 'Procesando...' : confirmBulkAction?.label || 'Confirmar'}
        danger={confirmBulkAction?.action === 'destroy'}
        disabled={loadingBulkAction}
        icon={confirmBulkAction?.action === 'destroy' ? 'fa-skull' : 'fa-info-circle'}
        onConfirm={onConfirmBulkAction}
        onCancel={onCancelBulkAction}
      />

      <VmModal
        open={confirmBulkDelete}
        title="Eliminar Instancias"
        message="Esta acción destruirá los discos virtuales de las VM(s) seleccionadas y no se puede deshacer."
        confirmLabel={loadingBulkDelete ? 'Eliminando...' : 'Sí, Eliminar Todo'}
        danger
        disabled={loadingBulkDelete}
        icon="fa-trash-alt"
        iconBg="bg-red-100"
        iconColor="text-red-600"
        onConfirm={onConfirmBulkDelete}
        onCancel={onCancelBulkDelete}
      />

      <VmModal
        open={confirmBulkRecreate !== null}
        title={`Recrear ${confirmBulkRecreate?.length ?? 0} VM(s)`}
        message={`Se van a recrear ${confirmBulkRecreate?.length ?? 0} VM(s) desde su plantilla. Esto no puede deshacerse.`}
        confirmLabel={loadingBulkRecreate ? 'Recreando...' : 'Recrear'}
        danger
        disabled={loadingBulkRecreate}
        icon="fa-code-branch"
        iconBg="bg-purple-100"
        iconColor="text-purple-600"
        onConfirm={onConfirmBulkRecreate}
        onCancel={onCancelBulkRecreate}
      />

      <VmModal
        open={confirmAddVm !== null}
        title="Añadir Máquina"
        message={confirmAddVm !== null ? `Se creará la VM vhost-${confirmAddVm} con los valores por defecto de la plantilla.` : ''}
        confirmLabel={creatingVm ? 'Creando...' : 'Crear'}
        disabled={creatingVm}
        icon="fa-plus"
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
        onConfirm={onConfirmAddVm}
        onCancel={onCancelAddVm}
      />
    </>
  )
}
