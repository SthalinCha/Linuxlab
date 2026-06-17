import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../services/api'
import type { DashboardData, DashboardHistory, TopConsumers } from '../types'

export function useDashboard(pollIntervalMs = 20000) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [history, setHistory] = useState<DashboardHistory | null>(null)
  const [topConsumers, setTopConsumers] = useState<TopConsumers | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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

  useEffect(() => {
    fetchAll()
    if (pollIntervalMs > 0) {
      intervalRef.current = setInterval(fetchAll, pollIntervalMs)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } else {
        fetchAll()
        if (pollIntervalMs > 0) {
          intervalRef.current = setInterval(fetchAll, pollIntervalMs)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
      abortRef.current?.abort()
    }
  }, [fetchAll, pollIntervalMs])

  return { data, history, topConsumers, error, refetch: fetchAll }
}
