import { useState, useCallback, useRef } from 'react'

export function useAsyncAction() {
  const [, forceUpdate] = useState(0)
  const loadingRef = useRef<Set<string>>(new Set())

  const execute = useCallback(async <T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> => {
    if (loadingRef.current.has(key)) return undefined
    loadingRef.current.add(key)
    forceUpdate(n => n + 1)
    try {
      return await fn()
    } finally {
      loadingRef.current.delete(key)
      forceUpdate(n => n + 1)
    }
  }, [])

  const isLoading = useCallback((key: string): boolean => {
    return loadingRef.current.has(key)
  }, [])

  return { execute, isLoading }
}
