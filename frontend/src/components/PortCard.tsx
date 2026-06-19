import { useState } from 'react'
import type { Port } from '../types'
import ServiceChip from './ServiceChip'

interface PortGroupProps {
  ports: Port[]
  portIndices: number[]
  onDelete: (index: number) => void
  disabled?: boolean
  hostIp?: string
  vmIp?: string
}

interface ServiceGroup {
  serviceName: string
  ports: Port[]
  indices: number[]
}

export default function PortCard({ ports, portIndices, onDelete, disabled, hostIp, vmIp }: PortGroupProps) {
  const [expandedService, setExpandedService] = useState<string | null>(null)

  if (ports.length === 0) return null

  const groups: Record<string, ServiceGroup> = {}
  ports.forEach((p, idx) => {
    const key = p.serviceName || p.service
    if (!groups[key]) groups[key] = { serviceName: key, ports: [], indices: [] }
    groups[key].ports.push(p)
    groups[key].indices.push(portIndices[idx])
  })

  const entries = Object.values(groups)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {entries.map(g => (
          <ServiceChip
            key={g.serviceName}
            serviceName={g.serviceName}
            count={g.ports.length}
            selected={expandedService === g.serviceName}
            onClick={disabled ? undefined : () => {
              setExpandedService(prev => prev === g.serviceName ? null : g.serviceName)
            }}
          />
        ))}
        <span className="text-[10px] text-slate-400 ml-1 font-medium">
          {ports.length} regla{ports.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Expanded inline detail */}
      {entries.map(g => {
        if (expandedService !== g.serviceName) return null
        const firstHost = g.ports[0]?.host
        const lastHost = g.ports[g.ports.length - 1]?.host
        const firstVm = g.ports[0]?.vm

        return (
          <div
            key={`detail-${g.serviceName}`}
            className="border border-slate-200 rounded-xl bg-white overflow-hidden transition-all duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-slate-700">{g.serviceName}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{g.ports.length} reglas</span>
                {g.ports.length > 1 && (
                  <>
                    <span className="text-slate-400">·</span>
                    <code className="font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      Host: {firstHost}–{lastHost}
                    </code>
                    <code className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      Guest: {firstVm}–{firstVm! + g.ports.length - 1}
                    </code>
                  </>
                )}
              </div>
              <button
                onClick={() => setExpandedService(null)}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <i className="fas fa-times text-[10px]" />
              </button>
            </div>

            {/* Port table */}
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white border-b border-slate-100">
                    <th className="px-4 py-2 text-left font-semibold text-slate-400 w-8">#</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-400">Host</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-400">→ VM</th>
                    {hostIp && <th className="px-4 py-2 text-left font-semibold text-slate-400 hidden sm:table-cell">Acceso</th>}
                    <th className="px-4 py-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {g.ports.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-1.5 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-1.5">
                        <code className="font-mono text-slate-700">{p.host}</code>
                      </td>
                      <td className="px-4 py-1.5">
                        <code className="font-mono text-slate-700">{p.vm}</code>
                      </td>
                      {hostIp && (
                        <td className="px-4 py-1.5 hidden sm:table-cell">
                          <code className="text-[10px] text-slate-400 font-mono">
                            {hostIp}:{p.host} → {vmIp || '?'}:{p.vm}
                          </code>
                        </td>
                      )}
                      <td className="px-4 py-1.5 text-center">
                        <button
                          onClick={() => {
                            const realIdx = g.indices[i]
                            onDelete(realIdx)
                            if (g.ports.length <= 1) setExpandedService(null)
                          }}
                          className="w-6 h-6 rounded flex items-center justify-center
                            text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <i className="fas fa-trash-alt text-[10px]" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
