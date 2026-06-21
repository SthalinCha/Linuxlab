import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoginBackground from '../components/LoginBackground'

export default function Login() {
  const navigate = useNavigate()
  const { login: authLogin } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authLogin(username, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-[linear-gradient(135deg,_#eff6ff_0%,_#f8fafc_42%,_#ecfeff_100%)] text-slate-800">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:92px_92px]" />
      </div>

      <div className="pointer-events-none absolute -left-16 top-10 h-[38rem] w-[38rem] rounded-full bg-sky-200/55 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-28 h-[34rem] w-[34rem] rounded-full bg-emerald-200/40 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-8rem] left-1/3 h-[26rem] w-[26rem] rounded-full bg-amber-100/45 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 lg:px-8">
        <section className="relative w-full max-w-[34rem] overflow-hidden rounded-[2rem] border border-white/80 bg-white/88 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:p-8">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-emerald-200/35 blur-3xl" />

          <div className="relative z-10">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                <i className="fas fa-microchip text-xl text-slate-700" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">LinuxLab</h1>
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  Administración de laboratorios virtuales
                  <span className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">v2.1.0</span>
                </p>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-[2rem]">Iniciar sesión</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Ingresa con tus credenciales para entrar al panel administrativo.</p>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <i className="fas fa-circle-exclamation text-base text-red-500" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Usuario</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                    <i className="fas fa-user text-sm" />
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pl-11 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="admin"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Contraseña</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                    <i className="fas fa-lock text-sm" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pl-11 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 transition hover:text-slate-600"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? (
                      <i className="fas fa-eye text-sm" />
                    ) : (
                      <i className="fas fa-eye-slash text-sm" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(15,23,42,0.22)] transition hover:from-slate-800 hover:to-slate-600 focus:outline-none focus:ring-4 focus:ring-slate-300 disabled:opacity-60"
              >
                {loading ? (
                  <i className="fas fa-spinner fa-spin text-sm" />
                ) : (
                  <i className="fas fa-arrow-right text-sm" />
                )}
                {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
              </button>
            </form>
          </div>
        </section>

        <div className="hidden lg:ml-16 lg:block">
          <LoginBackground />
        </div>
      </div>
    </div>
  )
}
