import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { api } from '../services/api'

interface AuthUser {
  username: string
  role: string
}

interface AuthContextType {
  user: AuthUser | null
  isAdmin: boolean
  isProfesor: boolean
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(atob(parts[1]))
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const loginAbortRef = useRef<AbortController | null>(null)

  const logout = useCallback(() => {
    loginAbortRef.current?.abort()
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('admin_username')
    setUser(null)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    loginAbortRef.current?.abort()
    const controller = new AbortController()
    loginAbortRef.current = controller
    const res = await api.auth.login(username, password, { signal: controller.signal })
    if (controller.signal.aborted) return
    localStorage.setItem('access_token', res.access_token)
    localStorage.setItem('refresh_token', res.refresh_token)
    localStorage.setItem('admin_username', username)
    setUser({ username, role: res.role_name })
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      const payload = decodeTokenPayload(token)
      if (payload && typeof payload.sub === 'string') {
        const role = (payload.role as string) || 'admin'
        setUser({ username: payload.sub, role })
      } else {
        logout()
      }
    }
    setLoading(false)
  }, [logout])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: user?.role === 'admin',
        isProfesor: user?.role === 'profesor',
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
