import { defineConfig } from 'vitest/config'

// Tests de non-régression (instantanés des documents / PDF). Environnement Node : les générateurs de HTML
// testés sont des fonctions pures. Fichier séparé de vite.config.js pour ne pas toucher à la configuration
// de l'application.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
