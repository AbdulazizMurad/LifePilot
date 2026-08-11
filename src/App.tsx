import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import { AuthPage } from './pages/AuthPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { MonthPage } from './pages/MonthPage'
import { DayPage } from './pages/DayPage'
import { NowPage } from './pages/NowPage'
import { AssistantPage } from './pages/AssistantPage'
import { SettingsPage } from './pages/SettingsPage'
import { BottomNav, SideNav } from './components/BottomNav'
import { QuickAdd } from './components/QuickAdd'
import { IconLogo } from './components/ui/icons'

function Splash() {
  return (
    <div className="center" style={{ minHeight: '100dvh', flexDirection: 'column', gap: 16 }}>
      <div className="logo-mark" style={{ animation: 'pop-in 0.4s ease both' }}>
        <IconLogo width={32} height={32} color="#fff" />
      </div>
      <span className="spinner" style={{ borderTopColor: 'var(--brand-ink)' }} />
    </div>
  )
}

function AppLayout() {
  const location = useLocation()
  // Hide the global quick-add on the assistant + settings screens.
  const showFab = !['/assistant', '/settings'].includes(location.pathname)
  return (
    <div className="app-layout">
      <SideNav />
      <div className="app-shell">
        <Routes>
          <Route path="/month" element={<MonthPage />} />
          <Route path="/day" element={<DayPage />} />
          <Route path="/now" element={<NowPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/now" replace />} />
        </Routes>
        {showFab && <QuickAdd defaultDay={new Date()} />}
      </div>
      <BottomNav />
    </div>
  )
}

function Gate() {
  const { loading, session, profile } = useAuth()
  if (loading) return <Splash />
  if (!session) return <AuthPage />
  // Profile row is created by a DB trigger; wait until it loads.
  if (!profile) return <Splash />
  if (!profile.onboarded) return <OnboardingPage />
  return (
    <DataProvider>
      <AppLayout />
    </DataProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
