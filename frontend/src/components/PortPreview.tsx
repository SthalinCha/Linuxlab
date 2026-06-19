import type { VirtualMachine } from '../types'

interface Config {
  mode: 'block' | 'linear'
  basePort: number
  portsPerVm: number
  guestPortStart: number
  protocol: 'tcp' | 'udp'
  description: string
}

interface PreviewRow {
  vmName: string
  vmId: number
  vmIp: string
  hostRange: string
  guestRange: string
  conflict: boolean
  conflictMsg?: string
}

interface Props {
  vms: VirtualMachine[]
  config: Config
}

function computePreview(vms: VirtualMachine[], config: Config): PreviewRow[] {
  const { mode, basePort, portsPerVm, guestPortStart } = config
  return vms.map((vm, idx) => {
    let hostRange: string
    let guestRange: string
    let conflict = false
    let conflictMsg: string | undefined

    if (mode === 'block') {
      const hostStart = basePort + idx * portsPerVm
      const hostEnd = hostStart + portsPerVm - 1
      const guestEnd = guestPortStart + portsPerVm - 1
      hostRange = `${hostStart}–${hostEnd}`
      guestRange = `${guestPortStart}–${guestEnd}`

      // Check conflict with existing ports
      const existing = vm.ports || []
      for (const p of existing) {
        if (p.host >= hostStart && p.host <= hostEnd) {
          conflict = true
          conflictMsg = `Puerto host ${p.host} ya en uso por "${p.service}"`
          break
        }
      }
    } else {
      const hostPort = basePort + idx
      hostRange = String(hostPort)
      guestRange = String(guestPortStart)

      const existing = vm.ports || []
      for (const p of existing) {
        if (p.host === hostPort) {
          conflict = true
          conflictMsg = `Puerto host ${hostPort} ya en uso por "${p.service}"`
          break
        }
      }
    }

    return { vmName: vm.name, vmId: vm.id, vmIp: vm.ip_address || '—', hostRange, guestRange, conflict, conflictMsg }
  })
}

export default function PortPreview({ vms, config }: Props) {
  const preview = computePreview(vms, config)
  const totalRules = config.mode === 'block' ? vms.length * config.portsPerVm : vms.length
  const conflicts = preview.filter(r => r.conflict)
  const lastHost = config.mode === 'block'
    ? config.basePort + vms.length * config.portsPerVm - 1
    : config.basePort + vms.length - 1

  if (vms.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-400">
        <i className="fas fa-inbox text-2xl mb-2 block" />
        Selecciona VMs en el paso anterior
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="bg-gradient-to-r from-indigo-50 to-slate-50 border border-indigo-100 rounded-xl px-4 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">VMs</div>
            <div className="text-lg font-bold text-indigo-700">{vms.length}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Reglas totales</div>
            <div className="text-lg font-bold text-indigo-700">{totalRules}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rango host</div>
            <div className="text-lg font-bold text-indigo-700 font-mono text-sm">{config.basePort} → {lastHost}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Protocolo</div>
            <div className="text-lg font-bold text-indigo-700">{config.protocol.toUpperCase()}</div>
          </div>
        </div>
        {config.description && (
          <div className="mt-2 pt-2 border-t border-indigo-100 text-xs text-slate-500">
            <i className="fas fa-tag mr-1" />
            {config.description}
          </div>
        )}
      </div>

      {/* Conflict alerts */}
      {conflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2">
            <i className="fas fa-triangle-exclamation text-amber-500 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-amber-800">
                {conflicts.length} VM(s) con posibles conflictos
              </div>
              <ul className="mt-1 space-y-0.5">
                {conflicts.map(c => (
                  <li key={c.vmId} className="text-xs text-amber-700">
                    <span className="font-medium">{c.vmName}</span>: {c.conflictMsg}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Preview table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">VM</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">IP</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Puerto Host</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Puerto Invitado</th>
                <th className="px-4 py-2.5 text-center font-semibold text-slate-500 w-20">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.map(row => (
                <tr
                  key={row.vmId}
                  className={`
                    transition-colors
                    ${row.conflict ? 'bg-amber-50/60' : 'hover:bg-slate-50'}
                  `}
                >
                  <td className="px-4 py-2 font-medium text-slate-800">{row.vmName}</td>
                  <td className="px-4 py-2 font-mono text-slate-400">{row.vmIp}</td>
                  <td className="px-4 py-2">
                    <code className="font-mono text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded">
                      {row.hostRange}
                    </code>
                  </td>
                  <td className="px-4 py-2">
                    <code className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {row.guestRange}
                    </code>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {row.conflict ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full" title={row.conflictMsg}>
                        <i className="fas fa-triangle-exclamation" />
                        Conflicto
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <i className="fas fa-check" />
                        Libre
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full summary strip */}
      <div className="flex items-center gap-3 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-4 py-2">
        <i className="fas fa-info-circle text-indigo-400" />
        <span>
          Se crearán <strong className="text-slate-700">{totalRules}</strong> regla(s) de reenvío
          {config.description && <> para <strong className="text-slate-700">"{config.description}"</strong></>}
        </span>
        {conflicts.length > 0 && (
          <span className="ml-auto text-amber-600">
            <i className="fas fa-triangle-exclamation mr-1" />
            {conflicts.length} conflicto(s) detectado(s)
          </span>
        )}
      </div>
    </div>
  )
}
