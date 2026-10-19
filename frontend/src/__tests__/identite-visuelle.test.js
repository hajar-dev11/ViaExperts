// Identité visuelle : typographie et icônes centralisées (références : captures de la liste des Clients).
// Environnement Node : analyse du texte des sources, comme les autres tests de conventions du projet.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')
const fichiers = (dossier, ext) => fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dossier, e.name)
  if (e.isDirectory()) return e.name === '__tests__' ? [] : fichiers(p, ext)
  return ext.test(e.name) ? [p] : []
})
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/')
const sources = fichiers(SRC, /\.(jsx|js)$/).map((f) => ({ rel: rel(f), texte: fs.readFileSync(f, 'utf8') }))

describe('typographie : une seule police, auto-hébergée', () => {
  it('Public Sans (variable) est la police de l\'interface, définie à un seul endroit', () => {
    const css = lire('index.css')
    // Importée par main.jsx (et non par `@import` Tailwind) pour que le build empaquette les fichiers .woff2.
    expect(lire('main.jsx')).toContain("import '@fontsource-variable/public-sans'")
    expect(css).not.toContain('@import "@fontsource-variable')
    expect(css).toMatch(/--font-sans:\s*"Public Sans Variable"/)
    expect(css).toContain('font-family: var(--font-sans)')
  })

  it('aucun appel à Google Fonts ni police de secours concurrente (Plus Jakarta Sans)', () => {
    const html = fs.readFileSync(path.join(SRC, '..', 'index.html'), 'utf8')
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
    expect(lire('index.css')).not.toContain('Plus Jakarta')
  })

  it('aucune page ne fixe sa propre police (hors documents imprimés, qui reproduisent des modèles officiels)', () => {
    const documentsImprimes = /^(modules\/.*\/(print|documents)\/|utils\/exporters\.js)/
    const fautifs = sources.filter((s) => !documentsImprimes.test(s.rel) && /font-family|fontFamily|font-mono|font-serif/.test(s.texte)).map((s) => s.rel)
    expect(fautifs).toEqual([])
  })

  it('les montants/numéros utilisent les chiffres tabulaires de la police, pas une police à chasse fixe', () => {
    expect(lire('modules/facturation/pages/DocumentList.jsx')).not.toContain('font-mono')
    expect(lire('pages/Mouvement.jsx')).not.toContain('font-mono')
  })
})

describe('icônes d\'action : un seul jeu (Lucide) et deux composants partagés', () => {
  it('« Modifier » et « Menu d\'actions » passent par ui/icons.jsx — jamais par Pencil ou ListTree', () => {
    const fautifs = sources
      .filter((s) => s.rel !== 'components/ui/icons.jsx')
      .filter((s) => s.texte.split('\n').some((l) => /<Pencil\b/.test(l) || (/icon=\{<ListTree\b/.test(l) && !l.includes('<Input'))))
      .map((s) => s.rel)
    expect(fautifs).toEqual([])
  })

  it('les icônes du menu d\'actions et du crayon sont celles de la référence', () => {
    const icones = lire('components/ui/icons.jsx')
    expect(icones).toContain("import { SquarePen } from 'lucide-react'")
    // Trois puces rondes + trois barres arrondies, pleines (viewBox 512 comme le fichier de référence).
    expect(icones.match(/<circle /g)).toHaveLength(3)
    expect(icones.match(/<rect /g)).toHaveLength(3)
    expect(icones).toContain('viewBox="0 0 512 512"')
  })

  it('toutes les listes à colonne ACTIONS utilisent ces composants', () => {
    for (const r of ['pages/ClientsList.jsx', 'pages/EntreprisesList.jsx', 'pages/ServicesList.jsx', 'pages/PaiementList.jsx',
      'modules/domiciliation/pages/DomiciliationList.jsx', 'modules/domiciliation/pages/DomiciliationCentres.jsx']) {
      expect(lire(r), r).toContain('IconeActions')
    }
  })

  it('aucune autre bibliothèque d\'icônes n\'est importée', () => {
    const fautifs = sources.filter((s) => /from '(react-icons|@heroicons|@tabler|@phosphor|@fortawesome|bootstrap-icons|@mui\/icons)/.test(s.texte)).map((s) => s.rel)
    expect(fautifs).toEqual([])
  })
})

describe('gabarit relevé sur la référence (à 125 % d\'échelle)', () => {
  it('menu latéral : 260 px, entrées de 38 px séparées de 6 px', () => {
    const side = lire('components/Sidebar.jsx')
    expect(side).toContain("'w-[260px]'")
    expect(side).toContain('space-y-1.5')
    expect(side).toMatch(/rounded-lg px-4 py-2 /)
  })

  it('les icônes des boutons de ligne et du menu d\'actions ont toutes la même taille (18 px)', () => {
    expect(lire('components/ListToolbar.jsx')).toContain('[&>svg]:h-[18px] [&>svg]:w-[18px]')
    expect(lire('components/ui/ActionMenu.jsx')).toContain('[&>svg]:h-[18px] [&>svg]:w-[18px]')
  })

  it('tableaux : texte 15 px, titre 18 px, en-têtes foncés, lignes de 60 px', () => {
    const table = lire('components/ui/Table.jsx')
    expect(table).toContain('<table className="w-full text-[15px]">')
    expect(table).toContain('text-lg font-medium text-ink-900')
    expect(table).toContain("'border-y border-line bg-white text-ink-950'")
    expect(table).toContain('text-[14px] font-medium tracking-wide uppercase')
    expect(table).toContain("'py-3.5'")
  })

  it('barre du haut : 56 px', () => {
    expect(lire('components/Topbar.jsx')).toContain('relative flex h-14 items-center')
  })
})
