type CacheEntry<T> = {
  data: T
  timestamp: number
  ttl: number
}

const store = new Map<string, CacheEntry<unknown>>()

const DEFAULT_TTL = 30_000

function cacheKey(path: string, options?: RequestInit): string {
  const method = options?.method || 'GET'
  const body = options?.body ? String(options.body) : ''
  return `${method}:${path}:${body}`
}

export function getCached<T>(path: string, options?: RequestInit, ttl?: number): T | null {
  const key = cacheKey(path, options)
  const entry = store.get(key)
  if (!entry) return null
  const age = Date.now() - entry.timestamp
  if (age < (ttl ?? entry.ttl)) return entry.data as T
  return null
}

export function setCache<T>(path: string, data: T, options?: RequestInit, ttl: number = DEFAULT_TTL): void {
  const key = cacheKey(path, options)
  store.set(key, { data, timestamp: Date.now(), ttl })
}

export function invalidateCache(pathPrefix?: string): void {
  if (!pathPrefix) {
    store.clear()
    return
  }
  for (const key of store.keys()) {
    if (key.includes(pathPrefix)) store.delete(key)
  }
}

function parseMethod(options?: RequestInit): string {
  return (options?.method || 'GET').toUpperCase()
}

export async function cachedRequest<T>(
  path: string,
  options?: RequestInit,
  signal?: AbortSignal,
  ttl?: number,
  fetcher: (path: string, options?: RequestInit, signal?: AbortSignal) => Promise<T>,
): Promise<T> {
  const method = parseMethod(options)
  const isMutation = method !== 'GET'

  if (!isMutation) {
    const cached = getCached<T>(path, options, ttl)
    if (cached !== null) return cached
  }

  const data = await fetcher(path, options, signal)

  if (!isMutation) {
    setCache(path, data, options, ttl)
  } else {
    invalidateCache('/vms')
    invalidateCache('/dashboard')
    invalidateCache('/assignments')
    invalidateCache('/students')
    invalidateCache('/audit')
    invalidateCache('/periods')
  }

  return data
}
