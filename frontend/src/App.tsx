import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { SkeletonBar } from './components/Skeleton'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const VMs = lazy(() => import('./pages/VMs'))
const Assignments = lazy(() => import('./pages/Assignments'))
const Network = lazy(() => import('./pages/Network'))
const Host = lazy(() => import('./pages/Host'))
const Students = lazy(() => import('./pages/Students'))
const Periods = lazy(() => import('./pages/Periods'))
const Audit = lazy(() => import('./pages/Audit'))
const Users = lazy(() => import('./pages/Users'))

function PageSkeleton() {
  return (
    <div className="space-y-6 p-4">
      <SkeletonBar className="h-8 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonBar className="h-40 w-full" />
        <SkeletonBar className="h-40 w-full" />
        <SkeletonBar className="h-40 w-full" />
      </div>
      <SkeletonBar className="h-64 w-full" />
    </div>
  )
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
}

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
        <Route path="dashboard" element={<LazyPage><ErrorBoundary><Dashboard /></ErrorBoundary></LazyPage>} />
        <Route path="vms" element={<LazyPage><ErrorBoundary><VMs /></ErrorBoundary></LazyPage>} />
        <Route path="assignments" element={<LazyPage><ErrorBoundary><ProtectedRoute roles={['profesor']}><Assignments /></ProtectedRoute></ErrorBoundary></LazyPage>} />
        <Route path="network" element={<LazyPage><ErrorBoundary><ProtectedRoute roles={['admin']}><Network /></ProtectedRoute></ErrorBoundary></LazyPage>} />
        <Route path="host" element={<LazyPage><ErrorBoundary><ProtectedRoute roles={['admin']}><Host /></ProtectedRoute></ErrorBoundary></LazyPage>} />
        <Route path="students" element={<LazyPage><ErrorBoundary><ProtectedRoute roles={['profesor']}><Students /></ProtectedRoute></ErrorBoundary></LazyPage>} />
        <Route path="periods" element={<LazyPage><ErrorBoundary><ProtectedRoute roles={['profesor']}><Periods /></ProtectedRoute></ErrorBoundary></LazyPage>} />
        <Route path="audit" element={<LazyPage><ErrorBoundary><ProtectedRoute roles={['admin']}><Audit /></ProtectedRoute></ErrorBoundary></LazyPage>} />
        <Route path="users" element={<LazyPage><ErrorBoundary><ProtectedRoute roles={['admin']}><Users /></ProtectedRoute></ErrorBoundary></LazyPage>} />
      </Route>
    </Routes>
  )
}
