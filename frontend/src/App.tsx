import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import VMs from './pages/VMs'
import Assignments from './pages/Assignments'
import Network from './pages/Network'
import Host from './pages/Host'
import Students from './pages/Students'
import Audit from './pages/Audit'
import Users from './pages/Users'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
        <Route path="vms" element={<ErrorBoundary><VMs /></ErrorBoundary>} />
        <Route path="assignments" element={<ErrorBoundary><Assignments /></ErrorBoundary>} />
        <Route path="network" element={<ErrorBoundary><ProtectedRoute roles={['admin']}><Network /></ProtectedRoute></ErrorBoundary>} />
        <Route path="host" element={<ErrorBoundary><ProtectedRoute roles={['admin']}><Host /></ProtectedRoute></ErrorBoundary>} />
        <Route path="students" element={<ErrorBoundary><Students /></ErrorBoundary>} />
        <Route path="audit" element={<ErrorBoundary><ProtectedRoute roles={['admin']}><Audit /></ProtectedRoute></ErrorBoundary>} />
        <Route path="users" element={<ErrorBoundary><ProtectedRoute roles={['admin']}><Users /></ProtectedRoute></ErrorBoundary>} />
      </Route>
    </Routes>
  )
}
