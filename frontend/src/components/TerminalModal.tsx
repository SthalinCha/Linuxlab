import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  open: boolean
  vmId?: number
  vmName: string
  onClose: () => void
  wsUrl?: string
}

export default function TerminalModal({ open, vmId, vmName, onClose, wsUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const terminalRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!open || !containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: '#1e293b', foreground: '#e2e8f0' },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    terminalRef.current = term

    const token = localStorage.getItem('access_token')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = wsUrl || `${protocol}//${host}/ws/terminal/${vmId}?token=${token}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      term.focus()
      term.write('\x1b[33mConectando...\x1b[0m\r\n')
    }

    ws.onmessage = (event) => {
      term.write(event.data)
    }

    ws.onclose = () => {
      term.write('\r\n\x1b[31mConexión terminada\x1b[0m')
    }

    ws.onerror = () => {
      term.write('\r\n\x1b[31mError de conexión\x1b[0m')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      ws.close()
      term.dispose()
      wsRef.current = null
      terminalRef.current = null
    }
  }, [open, vmId])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-[90vw] max-w-5xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-700 rounded-t-lg">
          <span className="text-sm font-medium text-slate-200">Terminal — {vmName}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
        <div ref={containerRef} className="flex-1 min-h-[60vh]" />
      </div>
    </div>
  )
}
