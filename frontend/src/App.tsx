import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import WorkspacePage from './pages/WorkspacePage'
import HistoryPage from './pages/HistoryPage'
import RunDetailPage from './pages/RunDetailPage'
import DashboardPage from './pages/DashboardPage'
import NotFoundPage from './pages/NotFoundPage'
import { useSession } from './lib/session'

function Protected({ children }: { children: JSX.Element }) {
  return useSession().authed ? children : <Navigate to="/login" replace />
}

function GuestOnly({ children }: { children: JSX.Element }) {
  return useSession().authed ? <Navigate to="/workspace" replace /> : children
}

// Old URLs from before the redesign keep working.
function LegacyJobRedirect() {
  const { id } = useParams()
  return <Navigate to={`/runs/${id}`} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><SignupPage /></GuestOnly>} />
      <Route path="/workspace" element={<Protected><WorkspacePage /></Protected>} />
      <Route path="/history" element={<Protected><HistoryPage /></Protected>} />
      <Route path="/runs/:id" element={<Protected><RunDetailPage /></Protected>} />
      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/execute" element={<Navigate to="/workspace" replace />} />
      <Route path="/jobs" element={<Navigate to="/history" replace />} />
      <Route path="/jobs/:id" element={<LegacyJobRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
