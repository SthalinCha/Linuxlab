import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { useDashboard } from '../hooks/useDashboard'
import ContentHeader from '../components/ContentHeader'
import { SkeletonBar, StatsSkeleton } from '../components/Skeleton'

export default function Dashboard() {
  const { data, history, topConsumers, error } = useDashboard()

  if (!data) {
    return (
      <div className="space-y-6">
        <ContentHeader title="Dashboard" icon="fa-chart-pie" />
        <StatsSkeleton count={3} />
        <div className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-4">
          <div className="bg-white rounded-lg shadow p-5">
            <SkeletonBar className="h-4 w-48 mb-4" />
            <SkeletonBar className="h-[280px] w-full" />
          </div>
          <div className="bg-white rounded-lg shadow p-5">
            <SkeletonBar className="h-4 w-36 mb-4" />
            <SkeletonBar className="h-6 w-full mb-3" />
            <SkeletonBar className="h-6 w-full mb-3" />
            <SkeletonBar className="h-6 w-full mb-3" />
            <SkeletonBar className="h-6 w-3/4" />
          </div>
        </div>
      </div>
    )
  }

  const topRam = topConsumers?.top_ram
  const maxRamForBar = topRam?.length
    ? Math.max(...topRam.map(v => v.ram_gb ?? 0), 1)
    : 1

  return (
    <div className="space-y-6">
      <ContentHeader title="Dashboard" icon="fa-chart-pie" />

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* FILA SUPERIOR: 3 columnas iguales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Tarjeta 1: Sistema y Estado */}
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-3">
            Sistema y Estado
          </h2>
          <div className="text-lg font-bold text-slate-800 truncate">
            {data.hostname}
          </div>
          <div className="text-xs text-slate-400 mb-3">{data.uptime}</div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center mb-3">
            <div className="flex items-center justify-center gap-1.5">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-3xl font-bold text-green-600">{data.health_score}%</span>
            </div>
            <div className="text-xs text-green-700 font-medium">Salud del Sistema</div>
          </div>

          {data.alerts_count > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center mb-3">
              <span className="text-xs font-semibold text-red-700">
                {data.alerts_count} alerta{data.alerts_count !== 1 ? 's' : ''} activa{data.alerts_count !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          <div className="space-y-1 text-xs text-slate-500">
            <div>
              <span className="text-slate-400">OS:</span> {data.os}
            </div>
            <div>
              {data.cpu_temp != null ? (
                <><span className="text-slate-400">Temp:</span> {data.cpu_temp} &deg;C</>
              ) : (
                <><span className="text-slate-400">Load:</span> {data.load_1.toFixed(2)} / {data.load_5.toFixed(2)} / {data.load_15.toFixed(2)}</>
              )}
            </div>
          </div>
        </div>

        {/* Tarjeta 2: Recursos del Host */}
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-4">
            Recursos del Host
          </h2>

          <div className="space-y-4">
            {/* CPU */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-semibold text-slate-700">CPU</span>
                <span className="text-lg font-bold text-blue-600">
                  {data.cpu_percent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${data.cpu_percent}%` }}
                />
              </div>
            </div>

            {/* RAM */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-semibold text-slate-700">RAM</span>
                <span className="text-lg font-bold text-green-600">
                  {data.ram_percent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${data.ram_percent}%` }}
                />
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {data.ram_used_gb} / {data.ram_total_gb} GB usados
              </div>
            </div>

            {/* Almacenamiento */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-semibold text-slate-700">Almacenamiento</span>
                <span className="text-lg font-bold text-amber-600">
                  {data.disk_percent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${data.disk_percent}%` }}
                />
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {data.disk_used_gb} / {data.disk_total_gb} GB usados
              </div>
            </div>
          </div>
        </div>

        {/* Tarjeta 3: Máquinas Virtuales */}
        <div className="bg-white rounded-lg shadow p-5 flex flex-col items-center justify-center">
          <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Máquinas Virtuales
          </h2>
          <div className="text-5xl font-bold text-slate-800 my-2">
            {data.total_vms}
          </div>
          <div className="text-sm text-slate-500 mb-4">Instancias Creadas</div>
          <div className="text-xs text-slate-400 mb-3">vCPUs asignados: <span className="font-semibold text-slate-700">{data.vcpu_assigned}</span></div>
          <div className="flex gap-5 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
              <span className="font-medium text-green-700">{data.running_vms}</span>
              <span className="text-slate-400">Activas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" />
              <span className="font-medium text-slate-600">{data.stopped_vms}</span>
              <span className="text-slate-400">Apagadas</span>
            </div>
          </div>
        </div>
      </div>

      {/* FILA INFERIOR: 65% / 35% */}
      <div className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-4">

        {/* Columna Izquierda: Historial combinado CPU + RAM (24h) */}
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            HISTORIAL DEL HOST (Últimas 24h)
          </h3>
          {history && history.cpu_history.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={history.cpu_history.map((point, i) => ({
                time: point.time,
                cpu: point.cpu,
                ram: history.ram_history[i]?.ram ?? 0,
              }))}>
                <XAxis dataKey="time" fontSize={10} tickFormatter={(val) => val ? new Date(val).toLocaleTimeString('es-PE', {hour: '2-digit', minute: '2-digit', hour12: false}) : ''} />
                <YAxis domain={[0, 100]} fontSize={10} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  stroke="#3b82f6"
                  name="CPU %"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="ram"
                  stroke="#10b981"
                  name="RAM %"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-slate-400 text-center py-12">
              Cargando historial...
            </div>
          )}
        </div>

        {/* Columna Derecha: Top Consumidores */}
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            TOPS DE CONSUMO POR VM
          </h3>

          {/* TOP CPU */}
          <h4 className="text-xs font-semibold text-blue-600 uppercase mb-2">
            Top CPU
          </h4>
          <div className="space-y-1.5 mb-5">
            {topConsumers && topConsumers.top_cpu.length > 0 ? (
              topConsumers.top_cpu.slice(0, 5).map((vm, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-24 truncate" title={vm.name}>
                    {vm.name}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded h-3">
                    <div
                      className="bg-blue-500 h-3 rounded"
                      style={{ width: `${vm.cpu_percent ?? 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-600 w-8 text-right">
                    {vm.cpu_percent ?? 0}%
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 text-center py-3">Sin datos</div>
            )}
          </div>

          {/* TOP RAM */}
          <h4 className="text-xs font-semibold text-green-600 uppercase mb-2">
            Top RAM
          </h4>
          <div className="space-y-1.5">
            {topConsumers && topConsumers.top_ram.length > 0 ? (
              topConsumers.top_ram.slice(0, 5).map((vm, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-24 truncate" title={vm.name}>
                    {vm.name}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded h-3">
                    <div
                      className="bg-green-500 h-3 rounded"
                      style={{ width: `${((vm.ram_gb ?? 0) / maxRamForBar) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-600 w-10 text-right">
                    {vm.ram_gb ?? 0} GB
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 text-center py-3">Sin datos</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
