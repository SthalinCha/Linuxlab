import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import ConfirmModal from './ConfirmModal'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/vms', label: 'Instancias' },
  { to: '/assignments', label: 'Asignaciones' },
  { to: '/network', label: 'Accesos' },
  { to: '/host', label: 'Host' },
]

export default function Layout() {
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showCreateAdmin, setShowCreateAdmin] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminFullName, setAdminFullName] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminSuccess, setAdminSuccess] = useState('')
  const [creating, setCreating] = useState(false)
  const [hasLibvirt, setHasLibvirt] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [changing, setChanging] = useState(false)

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

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('admin_username')
    navigate('/login')
  }

  const handleChangePassword = async () => {
    setPwError('')
    setPwSuccess('')
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError('Todos los campos son obligatorios')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('Las contraseñas nuevas no coinciden')
      return
    }
    if (newPassword.length < 6) {
      setPwError('La nueva contraseña debe tener al menos 6 caracteres')
      return
    }
    setChanging(true)
    try {
      await api.auth.changePassword(currentPassword, newPassword)
      setPwSuccess('Contraseña actualizada correctamente')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Error al cambiar contraseña')
    } finally {
      setChanging(false)
    }
  }

  const handleCreateAdmin = async () => {
    setAdminError('')
    setAdminSuccess('')
    if (!adminUsername || !adminPassword || !adminFullName) {
      setAdminError('Todos los campos son obligatorios')
      return
    }
    if (adminPassword.length < 6) {
      setAdminError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    setCreating(true)
    try {
      await api.auth.register({ username: adminUsername, password: adminPassword, full_name: adminFullName })
      setAdminSuccess(`Admin "${adminUsername}" creado correctamente`)
      setAdminUsername('')
      setAdminPassword('')
      setAdminFullName('')
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Error al crear admin')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-slate-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 flex items-center h-14">
          <div className="text-lg font-bold mr-8">LinuxLab</div>
          <nav className="flex items-center space-x-1 flex-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm rounded transition-colors ${
                    isActive
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* User Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
            >
              <span className="w-6 h-6 bg-slate-600 rounded-full flex items-center justify-center text-xs font-bold">
                {username.charAt(0).toUpperCase()}
              </span>
              <span>{username}</span>
              <svg className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
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

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Cambiar Contraseña</h2>

            {pwError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-sm">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded mb-4 text-sm">
                {pwSuccess}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña actual</label>
                <input type="password" value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nueva contraseña</label>
                <input type="password" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Confirmar nueva contraseña</label>
                <input type="password" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setShowChangePassword(false); setPwError(''); setPwSuccess(''); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('') }}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleChangePassword} disabled={changing}
                  className="px-4 py-2 text-sm text-white bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50">
                  {changing ? 'Cambiando...' : 'Cambiar Contraseña'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Admin Modal */}
      {showCreateAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Agregar Administrador</h2>

            {adminError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-sm">
                {adminError}
              </div>
            )}
            {adminSuccess && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded mb-4 text-sm">
                {adminSuccess}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo</label>
                <input type="text" value={adminFullName}
                  onChange={e => setAdminFullName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Usuario</label>
                <input type="text" value={adminUsername}
                  onChange={e => setAdminUsername(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña</label>
                <input type="password" value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setShowCreateAdmin(false); setAdminError(''); setAdminSuccess('') }}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleCreateAdmin} disabled={creating}
                  className="px-4 py-2 text-sm text-white bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50">
                  {creating ? 'Creando...' : 'Crear Admin'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
