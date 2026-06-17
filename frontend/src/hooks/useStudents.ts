import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import type { Student } from '../types'

export function useStudents(search: string) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setLoading(true)
    setError(null)
    try {
      const data = await api.students.list(search || undefined, { signal })
      if (signal.aborted) return
      if (Array.isArray(data)) setStudents(data); else console.warn('useStudents: students no es un array', data)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar estudiantes')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [search])

  useEffect(() => { load(); return () => abortRef.current?.abort() }, [load])

  return { students, loading, error, refetch: load }
}
