import type { DashboardData } from '../types'

interface Props {
  runningCount: number
  stoppedCount: number
  totalCpuAlloc: number
  totalRamGb: number
  dashboardData: DashboardData | null
}

export default function VMStats({ runningCount, stoppedCount, totalCpuAlloc, totalRamGb, dashboardData }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            <i className="fas fa-play mr-1"></i>Activas
          </span>
          <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><i className="fas fa-power-off text-sm"></i></span>
        </div>
        <div className="text-[1.75rem] font-bold tracking-tight text-emerald-600">{runningCount}</div>
      </div>
      <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            <i className="fas fa-stop mr-1"></i>Apagadas
          </span>
          <span className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500"><i className="fas fa-circle-stop text-sm"></i></span>
        </div>
        <div className="text-[1.75rem] font-bold tracking-tight text-red-500">{stoppedCount}</div>
      </div>
      <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            <i className="fas fa-microchip mr-1"></i>Overcommit CPU
          </span>
          <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><i className="fas fa-microchip text-sm"></i></span>
        </div>
        <div className="text-[1.75rem] font-bold tracking-tight text-blue-600">{totalCpuAlloc} vCPU</div>
        <div className="text-xs text-slate-400 mt-0.5">Ratio {dashboardData?.cpu_count ? (totalCpuAlloc / dashboardData.cpu_count).toFixed(2) : '?'}x</div>
      </div>
      <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            <i className="fas fa-memory mr-1"></i>RAM Comprometida
          </span>
          <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600"><i className="fas fa-memory text-sm"></i></span>
        </div>
        <div className="text-[1.75rem] font-bold tracking-tight text-purple-600">{totalRamGb > 1024 ? `${(totalRamGb / 1024).toFixed(1)} TB` : `${totalRamGb.toFixed(1)} GB`}</div>
        <div className="text-xs text-slate-400 mt-0.5">de {dashboardData?.ram_total_gb ?? '?'} GB</div>
      </div>
    </div>
  )
}
