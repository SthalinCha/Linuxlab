import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import VMs from './pages/VMs'
import Assignments from './pages/Assignments'
import Network from './pages/Network'
import Host from './pages/Host'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

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
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="vms" element={<VMs />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="network" element={<Network />} />
        <Route path="host" element={<Host />} />
      </Route>
    </Routes>
  )
}
