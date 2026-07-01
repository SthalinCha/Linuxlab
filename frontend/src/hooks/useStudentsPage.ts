import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import type { Student, Period } from '../types'

export function useStudentsPage() {
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
      const effectivePeriodId = periodId ?? (selectedPeriodId || undefined)

      const [s, aData] = await Promise.all([
        api.students.list(undefined, { signal }),
        effectivePeriodId
          ? api.assignments.list(false, effectivePeriodId, { signal })
          : Promise.resolve({ items: [], total: 0 }),
      ])
      if (signal.aborted) return

      const allStudents = s && Array.isArray(s.items) ? s.items : []
      const periodStudentIds = new Set(
        (Array.isArray(aData.items) ? aData.items : []).map(a => a.student_id)
      )

      if (effectivePeriodId) {
        setStudents(allStudents.filter(st => periodStudentIds.has(st.id)))
      } else {
        setStudents(allStudents)
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [selectedPeriodId])

  const loadPeriods = useCallback(async () => {
    try {
      const [list, cp] = await Promise.all([
        api.periods.list(),
        api.periods.current(),
      ])
      setAllPeriods(list)
      if (cp) setCurrentPeriod(cp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar períodos')
    }
  }, [])

  const initialized = useRef(false)

  useEffect(() => {
    loadPeriods()
    return () => {
      abortRef.current?.abort()
    }
  }, [loadPeriods])

  useEffect(() => {
    if (currentPeriod && !initialized.current) {
      initialized.current = true
      setSelectedPeriodId(currentPeriod.id)
    }
  }, [currentPeriod])

  useEffect(() => {
    if (selectedPeriodId !== 0) {
      load(selectedPeriodId)
    }
  }, [selectedPeriodId, load])

  const handleSelectPeriod = useCallback((periodId: number) => {
    setSelectedPeriodId(periodId)
  }, [])

  return {
    students, allPeriods, currentPeriod,
    selectedPeriodId, loading, error,
    refetch: load, handleSelectPeriod,
  }
}
