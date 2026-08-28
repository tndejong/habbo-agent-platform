import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api } from './utils/api'
import { AuthPage } from './auth/AuthPage'
import { OnboardingPage } from './onboarding/OnboardingPage'
import { DashboardInner } from './dashboard/DashboardInner'
import { OrchestrationLayout } from './orchestration/OrchestrationLayout'
import { UiBuildFooter } from './UiBuildFooter'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ScanLoginPage } from './auth/ScanLoginPage'

export default function App() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/auth/me')
      .then(d => { setMe(d.user || null); setLoading(false) })
      .catch(() => { setMe(null); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
      <UiBuildFooter />
    </div>
  )

  // Check if user needs onboarding (no API keys configured)
  const needsOnboarding = me && !me.has_anthropic_key

  // Check for password reset params — always route to /login with them preserved
  const params = new URLSearchParams(window.location.search)
  const hasResetParams = params.get('reset') === '1'

  // Optional post-login redirect target (e.g. back to /scan-login?ticket=...).
  // Only accept a same-app relative path — never an absolute/protocol-relative URL.
  const nextParam = params.get('next')
  const safeNext = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null

  return (
    <Routes>
      <Route
        path="/login"
        element={me && !hasResetParams ? <Navigate to={safeNext || (needsOnboarding ? '/onboarding' : '/app/home')} replace /> : <AuthPage onLogin={setMe} UiBuildFooter={UiBuildFooter} />}
      />

      <Route
        path="/scan-login"
        element={
          me ? (
            <ScanLoginPage />
          ) : (
            <Navigate to={`/login?next=${encodeURIComponent('/scan-login' + window.location.search)}`} replace />
          )
        }
      />
      <Route path="/" element={<Navigate to={me && !hasResetParams ? (needsOnboarding ? '/onboarding' : '/app/home') : (hasResetParams ? '/login' + window.location.search : '/login')} replace />} />
      
      {/* Onboarding route - only shown to users without API keys */}
      <Route
        path="/onboarding"
        element={
          me ? (
needsOnboarding ? (
                <OnboardingPage me={me} onComplete={() => {
                  // After onboarding completion, refetch user data to get accurate has_*_key values
                  api('/api/auth/me').then(d => setMe(d.user))
                }} />
              ) : (
              <Navigate to="/app/home" replace />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/app"
        element={<ProtectedRoute me={me} setMe={setMe} hasResetParams={hasResetParams} />}
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path=":tab" element={<DashboardInner />} />
      </Route>

      <Route
        path="/orchestration"
        element={<ProtectedRoute me={me} setMe={setMe} hasResetParams={hasResetParams} />}
      >
        <Route index element={<Navigate to="teams" replace />} />
        <Route path=":tab" element={<OrchestrationLayout />} />
      </Route>

      <Route path="*" element={<Navigate to={me && !hasResetParams ? (needsOnboarding ? '/onboarding' : '/app/home') : (hasResetParams ? '/login' + window.location.search : '/login')} replace />} />
    </Routes>
  )
}
