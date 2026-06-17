import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import ChangePasswordModal from './ChangePasswordModal'
import CreateAdminModal from './CreateAdminModal'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/vms', label: 'Instancias' },
  { to: '/assignments', label: 'Asignaciones' },
  { to: '/network', label: 'Accesos' },
  { to: '/students', label: 'Estudiantes' },
  { to: '/audit', label: 'Auditoría' },
  { to: '/host', label: 'Host' },
]

export default function Layout() {
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showCreateAdmin, setShowCreateAdmin] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [hasLibvirt, setHasLibvirt] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.host.get().then(h => setHasLibvirt(h.has_libvirt)).catch(() => {})
  }, [])

  const username = localStorage.getItem('admin_username') || 'Admin'

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('admin_username')
    navigate('/login')
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 text-sm rounded transition-colors ${
      isActive
        ? 'bg-slate-700 text-white'
        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-slate-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 flex items-center h-14">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden mr-3 p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
            aria-label="Abrir menú"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="text-lg font-bold mr-8">LinuxLab</div>

          <nav className="hidden md:flex items-center space-x-1 flex-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/dashboard'}
                className={navLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="relative ml-auto" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="hidden md:flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
            >
              <span className="w-6 h-6 bg-slate-600 rounded-full flex items-center justify-center text-xs font-bold">
                {username.charAt(0).toUpperCase()}
              </span>
              <span>{username}</span>
              <svg className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="md:hidden p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
              aria-label="Menú de usuario"
            >
              <span className="w-7 h-7 bg-slate-600 rounded-full flex items-center justify-center text-xs font-bold">
                {username.charAt(0).toUpperCase()}
              </span>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                <button
                  onClick={() => { setDropdownOpen(false); setShowCreateAdmin(true) }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Agregar Admin
                </button>
                <button
                  onClick={() => { setDropdownOpen(false); setShowChangePassword(true) }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Cambiar contraseña
                </button>
                <hr className="my-1 border-slate-200" />
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {!hasLibvirt && (
        <div className="bg-amber-500 text-white text-center text-sm font-medium py-2 px-4">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          libvirt no está disponible — los datos mostrados son simulados. Las operaciones de clonado y creación están deshabilitadas.
        </div>
      )}

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed top-0 left-0 bottom-0 w-64 bg-slate-800 shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-700">
              <span className="text-lg font-bold text-white">LinuxLab</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded transition-colors"
                aria-label="Cerrar menú"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/dashboard'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={navLinkClass}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="border-t border-slate-700 p-3 space-y-1">
              <button
                onClick={() => { setMobileMenuOpen(false); setShowCreateAdmin(true) }}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white rounded transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Agregar Admin
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); setShowChangePassword(true) }}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white rounded transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Cambiar contraseña
              </button>
              <hr className="border-slate-700" />
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 rounded transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Cerrar sesión
              </button>
              <div className="px-4 py-2 text-xs text-slate-500">{username}</div>
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>

      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <CreateAdminModal open={showCreateAdmin} onClose={() => setShowCreateAdmin(false)} />
    </div>
  )
}
