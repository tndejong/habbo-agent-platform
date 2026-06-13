import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api } from './utils/api'
import { HotelProvider } from './HotelContext'
import { AuthPage } from './auth/AuthPage'
import { DashboardInner } from './dashboard/DashboardInner'
import { UiBuildFooter } from './UiBuildFooter'

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

  return (
    <Routes>
      <Route
        path="/login"
        element={me ? <Navigate to="/app/home" replace /> : <AuthPage onLogin={setMe} UiBuildFooter={UiBuildFooter} />}
      />
      <Route path="/" element={<Navigate to={me ? '/app/home' : '/login'} replace />} />
      <Route
        path="/app"
        element={
          me ? (
            <HotelProvider me={me}>
              <Outlet context={{ me, setMe }} />
            </HotelProvider>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path=":tab" element={<DashboardInner />} />
      </Route>
      <Route path="*" element={<Navigate to={me ? '/app/home' : '/login'} replace />} />
    </Routes>
  )
}
