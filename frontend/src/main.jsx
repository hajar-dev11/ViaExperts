import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/public-sans'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ui/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Niveau racine : dernier filet de sécurité (aucun écran blanc), y compris si une erreur survient hors du Layout. */}
    <ErrorBoundary fullPage>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
