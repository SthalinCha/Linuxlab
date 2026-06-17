import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type ToastType = 'loading' | 'success' | 'error' | 'warning'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  addToast: (type: ToastType, message: string) => number
  removeToast: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, type, message }])
    if (type !== 'loading') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 4000)
    }
    return id
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[60] space-y-2 w-80">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-l-4 ${
              t.type === 'loading' ? 'border-l-blue-500' :
              t.type === 'success' ? 'border-l-emerald-500' :
              t.type === 'warning' ? 'border-l-yellow-500' :
              'border-l-red-500'
            }`}
          >
            {t.type === 'loading' ? (
              <i className="fas fa-spinner fa-spin text-blue-500 mt-0.5"></i>
            ) : t.type === 'success' ? (
              <i className="fas fa-check-circle text-emerald-500 mt-0.5"></i>
            ) : t.type === 'warning' ? (
              <i className="fas fa-exclamation-triangle text-yellow-500 mt-0.5"></i>
            ) : (
              <i className="fas fa-times-circle text-red-500 mt-0.5"></i>
            )}
            <span className="flex-1 text-sm text-slate-700">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="text-slate-400 hover:text-slate-600 leading-none text-lg">&times;</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
