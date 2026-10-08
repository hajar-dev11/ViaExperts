import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'
import ErrorBoundary from './ui/ErrorBoundary.jsx'

/**
 * Layout — sidebar sombre fixe + zone de travail sur fond #F8F7FA,
 * la topbar y flottant en barre blanche arrondie, comme sur les captures.
 */
export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Topbar onMenuClick={() => setMobileOpen(true)} />

        <main className="flex-1 px-4 pt-6 pb-8 sm:px-6">
          {/* Une page cassée n'immobilise pas le menu : l'erreur reste dans la zone de travail et s'efface au changement de route. */}
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>

        <footer className="px-4 pb-6 text-sm text-ink-600 sm:px-6">
          © 2026 , Via Experts
        </footer>
      </div>
    </div>
  )
}
