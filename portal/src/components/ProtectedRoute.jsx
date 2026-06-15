import { Navigate, Outlet } from 'react-router-dom'
import { HotelProvider } from '../HotelContext'

/**
 * ProtectedRoute wrapper that ensures:
 * 1. User is authenticated (has me)
 * 2. User has completed onboarding (has API keys configured)
 * 3. Otherwise redirects to appropriate page (login or onboarding)
 */
export function ProtectedRoute({ me, setMe, hasResetParams }) {
  // Check if user needs onboarding (no API keys configured)
  const needsOnboarding = me && !me.has_anthropic_key

  // Password reset flow — redirect to /login with params preserved
  if (hasResetParams) {
    return <Navigate to={'/login' + window.location.search} replace />
  }

  // Not authenticated
  if (!me) {
    return <Navigate to="/login" replace />
  }

  // Needs onboarding
  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />
  }

  // Authenticated and has API keys - render the dashboard
  return (
    <HotelProvider me={me}>
      <Outlet context={{ me, setMe }} />
    </HotelProvider>
  )
}