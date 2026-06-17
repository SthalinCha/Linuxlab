import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import type { VMAssignment, VirtualMachine, Student, Period } from '../types'

export function useAssignments() {
  const [assignments, setAssignments] = useState<VMAssignment[]>([])
  const [vms, setVms] = useState<VirtualMachine[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [allPeriods, setAllPeriods] = useState<Period[]>([])
  const [currentPeriod, setCurrentPeriod] = useState<Period | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async (periodId?: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setLoading(true)
    setError(null)
    try {
      const [a, v, s, p] = await Promise.all([
        periodId ? api.assignments.list(false, periodId, { signal }) : api.assignments.list(true, undefined, { signal }),
        api.vms.list(undefined, { signal }),
        api.students.list(undefined, { signal }),
        api.periods.current({ signal }),
      ])
      if (signal.aborted) return
      if (Array.isArray(a)) setAssignments(a)
      if (Array.isArray(v)) setVms(v); else console.warn('useAssignments: vms no es un array', v)
      if (Array.isArray(s)) setStudents(s); else console.warn('useAssignments: students no es un array', s)
      if (p) setCurrentPeriod(p)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  const loadPeriods = useCallback(async () => {
    try {
      const list = await api.periods.list()
      setAllPeriods(list)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar períodos')
    }
  }, [])

  const handleActivatePeriod = useCallback(async (periodId: number) => {
    try {
      await api.periods.activate(periodId)
      setSelectedPeriodId(periodId)
      load(periodId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al activar período')
    }
  }, [load])

  useEffect(() => {
    load(); loadPeriods()
    return () => abortRef.current?.abort()
  }, [load, loadPeriods])

  useEffect(() => {
    if (currentPeriod && selectedPeriodId === 0) {
      setSelectedPeriodId(currentPeriod.id)
    }
  }, [currentPeriod, selectedPeriodId])

  return {
    assignments, vms, students, allPeriods,
    currentPeriod, selectedPeriodId, loading, error,
    refetch: load, loadPeriods, handleActivatePeriod,
  }
}
