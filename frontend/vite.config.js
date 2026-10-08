import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { verifierApiUrlProduction } from './vite.verification-env.js'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Un build de production sans URL d'API explicite (ou avec une URL locale) est arrêté ici : voir vite.verification-env.js.
  if (command === 'build' && mode === 'production') {
    verifierApiUrlProduction(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL)
  }

  return {
    plugins: [react()],
  }
})
