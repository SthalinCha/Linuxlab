import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../services/api'
import type { DashboardData, DashboardHistory, TopConsumers } from '../types'

function closeWebSocket(ws: WebSocket | null) {
  if (!ws) return
  ws.onmessage = null
  ws.onclose = null
  ws.onerror = null
  if (ws.readyState === WebSocket.OPEN) ws.close()
}

const POLL_MS = 120000
const WS_RECONNECT_MS = 3000

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [history, setHistory] = useState<DashboardHistory | null>(null)
  const [topConsumers, setTopConsumers] = useState<TopConsumers | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAll = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    try {
      const [d, h, t] = await Promise.all([
        api.dashboard.get({ signal }),
        api.dashboard.history({ signal }),
        api.dashboard.topConsumers({ signal }),
      ])
      if (signal.aborted) return
      setData(d)
      setHistory(h)
      setTopConsumers(t)
      setError(null)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar dashboard')
    }
  }, [])

  const connectWs = useCallback(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/ws/dashboard?token=${token}`

    closeWebSocket(wsRef.current)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const live = JSON.parse(event.data)
        setData(prev => prev ? { ...prev, ...live } : prev)
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      if (wsRef.current === ws) {
        reconnectRef.current = setTimeout(connectWs, WS_RECONNECT_MS)
      }
    }

    ws.onerror = () => ws.close()
  }, [])

  useEffect(() => {
    fetchAll()
    connectWs()
    pollRef.current = setInterval(fetchAll, POLL_MS)

    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(pollRef.current!)
        pollRef.current = null
        closeWebSocket(wsRef.current)
      } else {
        fetchAll()
        pollRef.current = setInterval(fetchAll, POLL_MS)
        connectWs()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(pollRef.current!)
      clearTimeout(reconnectRef.current!)
      closeWebSocket(wsRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
      abortRef.current?.abort()
    }
  }, [fetchAll, connectWs])

  return { data, history, topConsumers, error, refetch: fetchAll }
}
