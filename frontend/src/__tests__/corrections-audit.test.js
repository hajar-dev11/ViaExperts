// Régressions des corrections de l'audit global (étape 23) : dates locales et affichage des dates des listes.

import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aujourdhui, maintenantLocal } from '../shared/utils/date.js'
import { formatDate } from '../utils/format.js'

const SRC = path.resolve(__dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

afterEach(() => vi.useRealTimers())

describe('date du jour (locale, jamais UTC)', () => {
  it('aujourdhui() suit l\'heure locale, y compris juste après minuit', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 0, 30, 0)) // 06/10/2026 00:30, heure locale

    expect(aujourdhui()).toBe('2026-10-06')
  })

  it('le formulaire Rapports utilise aujourdhui() et non toISOString() (date UTC = la veille avant 1 h en UTC+1)', () => {
    const source = lire('pages/Rapports.jsx')

    expect(source).toContain('date_rapport: aujourdhui()')
    expect(source).not.toMatch(/date_rapport:\s*new Date\(\)\.toISOString\(\)/)
  })
})

describe('heure locale (fuseau Africa/Casablanca côté serveur)', () => {
  it('maintenantLocal() renvoie « AAAA-MM-JJ HH:mm:ss » en heure LOCALE, pas en UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 7, 0, 5, 9)) // 07/10/2026 00:05:09, heure locale

    expect(maintenantLocal()).toBe('2026-10-07 00:05:09')
  })

  it('les cachets et les courriers envoient l\'heure locale (plus toISOString(), qui est en UTC)', () => {
    for (const page of ['pages/Cachets.jsx', 'pages/Mails.jsx']) {
      const source = lire(page)

      expect(source, page).toContain('date_depart: maintenantLocal()')
      expect(source, page).not.toMatch(/date_depart:\s*new Date\(\)\.toISOString\(\)/)
    }
  })
})

describe('listes de documents : date de facturation lisible', () => {
  it('formatDate convertit le datetime renvoyé par l\'API en JJ/MM/AAAA', () => {
    expect(formatDate('2026-05-06 00:00:00')).toBe('06/05/2026')
    expect(formatDate(null)).toBe('')
  })

  it('DocumentList affiche la date formatée (et non « 2026-05-06 00:00:00 ») tout en triant sur la valeur brute', () => {
    const source = lire('modules/facturation/pages/DocumentList.jsx')

    expect(source).toMatch(/key: 'dateDocument'[^\n]*value: \(r\) => r\.dateDocument[^\n]*render: \(r\) => formatDate\(r\.dateDocument\)/)
  })
})

describe('erreur 403 de la liste des rapports', () => {
  it('affiche un message de permission, comme les autres modules', () => {
    const source = lire('pages/Rapports.jsx')

    expect(source).toContain("Vous n'avez pas la permission de consulter les rapports.")
  })
})
