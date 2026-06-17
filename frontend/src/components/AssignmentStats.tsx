interface Props {
  totalStudents: number
  activeCount: number
  pendingStudents: number
  freeVms: number
}

export default function AssignmentStats({ totalStudents, activeCount, pendingStudents, freeVms }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            <i className="fas fa-user-graduate mr-1"></i>Estudiantes Registrados
          </span>
          <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><i className="fas fa-users text-sm"></i></span>
        </div>
        <div className="text-[1.75rem] font-bold tracking-tight text-slate-900">{totalStudents}</div>
      </div>
      <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            <i className="fas fa-check-circle mr-1"></i>Estudiantes Asignados
          </span>
          <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><i className="fas fa-check text-sm"></i></span>
        </div>
        <div className="text-[1.75rem] font-bold tracking-tight text-emerald-600">{activeCount}</div>
      </div>
      <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            <i className="fas fa-hourglass-half mr-1"></i>Pendientes
          </span>
          <span className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><i className="fas fa-clock text-sm"></i></span>
        </div>
        <div className="text-[1.75rem] font-bold tracking-tight text-amber-600">{pendingStudents}</div>
        {pendingStudents > 0 && (
          <div className="text-[0.65rem] text-amber-600 font-medium mt-0.5">
            <i className="fas fa-triangle-exclamation mr-1"></i>{pendingStudents} sin VM
          </div>
        )}
      </div>
      <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            <i className="fas fa-server mr-1"></i>VMs Disponibles
          </span>
          <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><i className="fas fa-microchip text-sm"></i></span>
        </div>
        <div className="text-[1.75rem] font-bold tracking-tight text-blue-600">{freeVms}</div>
      </div>
    </div>
  )
}
