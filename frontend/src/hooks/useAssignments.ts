import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import type { VMAssignment, VirtualMachine, Student, Period } from '../types'

const PAGE_SIZE = 50

export function useAssignments() {
  const [assignments, setAssignments] = useState<VMAssignment[]>([])
  const [totalAssignments, setTotalAssignments] = useState(0)
  const [page, setPage] = useState(0)
  const [vms, setVms] = useState<VirtualMachine[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [allPeriods, setAllPeriods] = useState<Period[]>([])
  const [currentPeriod, setCurrentPeriod] = useState<Period | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalAssignments / PAGE_SIZE))

  const load = useCallback(async (periodId?: number, pageNum?: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setLoading(true)
    setError(null)
    try {
      const offset = (pageNum ?? page) * PAGE_SIZE
      const effectivePeriodId = periodId ?? (selectedPeriodId || undefined)
      const [aData, v, s] = await Promise.all([
        effectivePeriodId
          ? api.assignments.list(false, effectivePeriodId, { signal, limit: PAGE_SIZE, offset })
          : api.assignments.list(true, undefined, { signal, limit: PAGE_SIZE, offset }),
        api.vms.listLight({ signal }),
        api.students.list(undefined, { signal }),
      ])
      if (signal.aborted) return
      if (Array.isArray(aData.items)) {
        setAssignments(aData.items)
        setTotalAssignments(aData.total)
      } else {
        setAssignments([])
        setTotalAssignments(0)
      }
      if (Array.isArray(v)) setVms(v); else console.warn('useAssignments: vms no es un array', v)
      if (Array.isArray(s)) setStudents(s); else console.warn('useAssignments: students no es un array', s)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [page, selectedPeriodId])

  const loadPeriods = useCallback(async () => {
    try {
      const [list, cp] = await Promise.all([api.periods.list(), api.periods.current()])
      setAllPeriods(list)
      if (cp) setCurrentPeriod(cp)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar períodos')
    }
  }, [])

  const goToPage = useCallback((newPage: number) => {
    if (newPage >= 0 && newPage < totalPages) {
      setPage(newPage)
    }
  }, [totalPages])

  const handleSelectPeriod = useCallback((periodId: number) => {
    setPage(0)
    setSelectedPeriodId(periodId)
  }, [])

  const handleActivatePeriod = useCallback(async (periodId: number) => {
    try {
      await api.periods.activate(periodId)
      setPage(0)
      setSelectedPeriodId(periodId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al activar período')
    }
  }, [])

  const initialized = useRef(false)

  useEffect(() => {
    loadPeriods()
    return () => abortRef.current?.abort()
  }, [loadPeriods])

  useEffect(() => {
    if (currentPeriod && !initialized.current) {
      initialized.current = true
      setSelectedPeriodId(currentPeriod.id)
    } else if (!currentPeriod && !initialized.current && allPeriods.length > 0) {
      initialized.current = true
      load()
    }
  }, [currentPeriod, allPeriods, load])

  useEffect(() => {
    if (selectedPeriodId !== 0) {
      load(selectedPeriodId, page)
    }
  }, [selectedPeriodId, page, load])

  return {
    assignments, vms, students, allPeriods,
    currentPeriod, selectedPeriodId, loading, error,
    page, totalPages, totalAssignments, goToPage,
    refetch: load, loadPeriods, handleSelectPeriod, handleActivatePeriod,
  }
}
