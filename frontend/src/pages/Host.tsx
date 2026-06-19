import { useState, useEffect } from 'react'
import { api } from '../services/api'
import type { HostInfo } from '../types'
import ContentHeader from '../components/ContentHeader'

export default function Host() {
  const [host, setHost] = useState<HostInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const hostData = await api.host.get()
      setHost(hostData)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar información del host')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Cargando...</div>
  }

  if (!host) {
    return <div className="text-center text-slate-500 py-12">No se pudo cargar la información del host</div>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
          {error} <button onClick={() => setError('')} className="float-right font-bold">&times;</button>
        </div>
      )}
      <ContentHeader title="Host" icon="fa-server" />

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-heartbeat mr-1"></i>Estado
            </span>
            <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600"><i className="fas fa-check text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-green-600">En Línea</div>
          <div className="text-xs text-slate-400 mt-0.5">{host.uptime}</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-microchip mr-1"></i>CPU
            </span>
            <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><i className="fas fa-microchip text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-blue-600">{host.cpu_percent}%</div>
          <div className="text-xs text-slate-400 mt-0.5">{host.cpu_count} Cores &middot; {host.vcpu_allocated} vCPU</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-memory mr-1"></i>Memoria
            </span>
            <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600"><i className="fas fa-memory text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-purple-600">{host.ram_used_gb} / {host.ram_total_gb} GB</div>
          <div className="text-xs text-slate-400 mt-0.5">{host.ram_percent.toFixed(1)}% utilizado{host.swap_used_gb > 0 ? ` · Swap: ${host.swap_used_gb} GB` : ''}</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-database mr-1"></i>Almacenamiento
            </span>
            <span className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><i className="fas fa-database text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-amber-600">{host.disk_used_gb} / {host.disk_total_gb} GB</div>
          <div className="text-xs text-slate-400 mt-0.5">{host.disk_percent.toFixed(1)}% utilizado</div>
        </div>
      </div>

      {/* Información Técnica */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">Información Técnica</h3>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500 w-48">Hostname</td>
              <td className="px-4 py-3 font-medium">{host.hostname || '-'}</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500">Sistema Operativo</td>
              <td className="px-4 py-3">{host.os || '-'}</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500">Kernel</td>
              <td className="px-4 py-3 font-mono text-xs">{host.kernel || '-'}</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500">IP Principal</td>
              <td className="px-4 py-3 font-mono text-xs">{host.ip_principal || '-'}</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500">Bridge</td>
              <td className="px-4 py-3 font-mono text-xs">{host.bridge || '-'}</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500">Hypervisor</td>
              <td className="px-4 py-3">{host.hypervisor || '-'}</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500">Load Average</td>
              <td className="px-4 py-3 font-mono text-xs">{host.load_1} / {host.load_5} / {host.load_15}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  )
}
