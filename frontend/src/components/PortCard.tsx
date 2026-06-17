import type { Port } from '../types'

interface PortCardProps {
  port: Port
  portIndex: number
  onDelete: (index: number) => void
  disabled?: boolean
  hostIp?: string
  vmName?: string
}

const serviceIcon: Record<string, string> = {
  SSH: 'fa-terminal',
  HTTP: 'fa-globe',
  WEB: 'fa-globe',
  Cockpit: 'fa-server',
  FTP: 'fa-upload',
  MySQL: 'fa-database',
  Postgres: 'fa-database',
  HTTPS: 'fa-lock',
  DNS: 'fa-network-wired',
  SMTP: 'fa-envelope',
}

const serviceColor: Record<string, string> = {
  SSH: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  HTTP: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  WEB: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cockpit: 'bg-violet-50 text-violet-700 border-violet-200',
  FTP: 'bg-amber-50 text-amber-700 border-amber-200',
  MySQL: 'bg-orange-50 text-orange-700 border-orange-200',
  HTTPS: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

function accessUrl(port: Port, hostIp?: string, vmName?: string): string | null {
  if (!hostIp) return null
  const s = port.service.toLowerCase()
  if (s === 'ssh') return `ssh://estudiante@${hostIp}:${port.host}`
  if (s === 'http') return `http://${hostIp}:${port.host}`
  if (s === 'https') return `https://${hostIp}:${port.host}`
  if (s === 'cockpit' && vmName) {
    const num = vmName.split('-').pop()
    if (num) return `https://${hostIp}/vhost${num}/`
  }
  return `tcp://${hostIp}:${port.host}`
}

export default function PortCard({ port, portIndex, onDelete, disabled, hostIp, vmName }: PortCardProps) {
  const icon = serviceIcon[port.service] || 'fa-plug'
  const color = serviceColor[port.service] || 'bg-slate-50 text-slate-700 border-slate-200'
  const url = accessUrl(port, hostIp, vmName)

  const copyUrl = () => {
    if (url) navigator.clipboard.writeText(url)
  }

  return (
    <div className={`
      relative group flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-150
      ${color}
      ${disabled ? 'opacity-50 pointer-events-none' : 'hover:shadow-sm'}
    `}>
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-white/60 flex items-center justify-center text-sm border border-current/20">
        <i className={`fas ${icon}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide">{port.service}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <code className="text-xs font-mono font-medium bg-white/60 px-1.5 py-0.5 rounded">{port.host}</code>
          <span className="text-xs text-slate-400">&rarr;</span>
          <code className="text-xs font-mono font-medium bg-white/60 px-1.5 py-0.5 rounded">{port.vm}</code>
        </div>
        {url && (
          <div className="mt-1 flex items-center gap-1">
            <code className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]">{url}</code>
            <button
              onClick={(e) => { e.stopPropagation(); copyUrl() }}
              className="text-slate-400 hover:text-indigo-600 transition-colors text-[10px]"
              title="Copiar URL"
            >
              <i className="fas fa-copy" />
            </button>
          </div>
        )}
      </div>

      <button
        onClick={() => onDelete(portIndex)}
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center
          text-slate-400 hover:text-red-600 hover:bg-red-50
          transition-colors duration-150 opacity-0 group-hover:opacity-100"
        title="Eliminar regla"
      >
        <i className="fas fa-xmark text-sm" />
      </button>
    </div>
  )
}
