// Trois évolutions : motif du reçu de paiement (prestation réelle), action « Paiement » de la liste des factures (facture isolée dans
// la même page) et panneaux « Activité Service / Mail / Cachet » (activité de la première ligne du tableau par défaut).
// Environnement Node : rendu serveur de l'état initial et analyse du texte des sources (les clics sont vérifiés dans le navigateur).
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import FilActivite from '../components/ui/FilActivite.jsx'
import { construireHtmlRecuPaiement, construireHtmlRecuPdf } from '../modules/paiements/print/recuPaiement.js'
import { motifRecu } from '../modules/paiements/print/motifRecu.js'

const SRC = path.resolve(import.meta.dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('reçu de paiement : « Motif de l\'opération » = la prestation réelle', () => {
  const identite = { logo: '', nomSociete: 'Via Experts', signature: null, afficherPiedSurRecu: false }
  const paiement = (lignes, observation = '') => ({ id: 1, reference: '#1', client: 'CLIENT', total: '100.00', prixPaye: '100.00', prixRestant: '0.00', dateOperation: '2026-10-01', observation, lignes })
  const ligne = (service, designation = 'Libellé libre') => ({ service, designation })

  it('domiciliation → « Service de domiciliation »', () => {
    expect(motifRecu(paiement([ligne('Domiciliation')]))).toBe('Service de domiciliation')
    expect(motifRecu(paiement([ligne(' domiciliation ')]))).toBe('Service de domiciliation') // casse et espaces
  })

  it('une autre prestation garde son nom réel — jamais « Service » ni la désignation libre', () => {
    expect(motifRecu(paiement([ligne('audit fiscal', 'Service')]))).toBe('audit fiscal')
    expect(motifRecu(paiement([ligne('Location de salle de réception')]))).toBe('Location de salle de réception')
    expect(motifRecu(paiement([ligne('Déclaration TVA')]))).toBe('Déclaration TVA')
  })

  it('« Enregistrement de contrat de domiciliation » est un AUTRE service : il garde son nom, il n\'est pas confondu avec la domiciliation', () => {
    expect(motifRecu(paiement([ligne('Enregistrement de contrat de domiciliation')]))).toBe('Enregistrement de contrat de domiciliation')
  })

  it('plusieurs prestations : leurs noms réels, sans doublon, dans l\'ordre des lignes', () => {
    expect(motifRecu(paiement([ligne('Domiciliation'), ligne('audit fiscal'), ligne('Domiciliation')]))).toBe('Service de domiciliation, audit fiscal')
  })

  it('repli sûr si la prestation est indéterminée : l\'observation du paiement (comportement d\'avant), jamais un motif inventé', () => {
    expect(motifRecu(paiement([ligne(null, 'Règlement de démonstration')], 'Acompte convenu'))).toBe('Acompte convenu')
    expect(motifRecu(paiement([], 'Acompte convenu'))).toBe('Acompte convenu')
    expect(motifRecu({ ...paiement([]), lignes: undefined, observation: undefined })).toBe('')
    expect(motifRecu(paiement([ligne('', 'Service')]))).toBe('')
  })

  it('les deux modèles de reçu (HTML et PDF A4/A5) affichent ce motif, en majuscules, sans toucher au reste de la mise en page', () => {
    const p = paiement([ligne('Domiciliation')], 'Acompte')
    for (const html of [
      construireHtmlRecuPaiement(p, identite).bodyHtml,
      construireHtmlRecuPdf(p, identite, 'a4').bodyHtml,
      construireHtmlRecuPdf(p, identite, 'a5').bodyHtml,
    ]) {
      expect(html).toContain("Motif de l'opération :")
      expect(html).toContain('SERVICE DE DOMICILIATION')
      expect(html).not.toContain('ACOMPTE') // l'observation ne remplace plus la prestation quand elle est connue
      expect(html).toContain('REÇU DE PAIEMENT')
    }
    const sansService = construireHtmlRecuPdf(paiement([ligne(null)], 'Acompte'), identite, 'a5').bodyHtml
    expect(sansService).toContain('ACOMPTE')
  })

  it('l\'API fournit le nom réel du service de chaque ligne', () => {
    expect(fs.readFileSync(path.resolve(SRC, '../../backend/app/Http/Resources/PaiementResource.php'), 'utf8')).toContain("'service' => $l->service->nom ?? null")
  })
})

describe('activités : par défaut, l\'activité de la première ligne du tableau (Services en cours, Mails, Cachets)', () => {
  const pages = [
    ['pages/ServicesEnCours.jsx', 'selectedService', 'Activité Services'],
    ['pages/Mails.jsx', 'selected', 'Mail Activité'],
    ['pages/Cachets.jsx', 'selected', 'Cashet Activité'],
  ]

  it('la ligne sélectionnée est, par défaut, la première du tableau ; sinon celle choisie (clic ou œil)', () => {
    for (const [rel, selection] of pages) {
      const source = lire(rel)
      expect(source, rel).toContain(`const ${selection} = rows.find((r) => r.id === selected`)
      expect(source, rel).toContain('?? rows[0] ?? null')
    }
  })

  it('cette ligne est surlignée dans le tableau (comme la ligne verte de la référence)', () => {
    for (const [rel, selection] of pages) {
      expect(lire(rel), rel).toContain(`rowClassName={(r) => (${selection}?.id === r.id ? 'bg-success-100' : '')}`)
    }
  })

  it('l\'Accueil (panneau « Activité Services ») suit la même règle : première ligne du tableau par défaut, ligne surlignée', () => {
    const accueil = lire('pages/Dashboard.jsx')
    expect(accueil).toContain('const selectedService = services.find((r) => r.id === selectedId) ?? services[0] ?? null')
    expect(accueil).toContain("rowClassName={(r) => (selectedService?.id === r.id ? 'bg-success-100' : '')}")
    expect(accueil).toContain('const showServiceActivite = (r) => setSelectedId(r.id)')
    expect(accueil).toContain('getServiceEnCours(selectedServiceId)')
    expect(accueil).not.toContain("Revenir à l'activité globale")
  })

  it('le clic sur une ligne et l\'œil choisissent la ligne dont l\'activité s\'affiche', () => {
    expect(lire('pages/ServicesEnCours.jsx')).toContain('const showServiceActivite = (r) => setSelectedId(r.id)')
    for (const rel of ['pages/Mails.jsx', 'pages/Cachets.jsx']) {
      const source = lire(rel)
      expect(source, rel).toContain('onClick={() => setSelectedId(r.id)}')
      expect(source, rel).toContain('setSelectedId(r.id); ouvrirStatus(r)')
    }
  })

  it('le panneau affiche TOUTES les opérations de la ligne choisie (rien n\'est tronqué) ; le fil global ne sert que si le tableau est vide', () => {
    for (const rel of ['pages/Mails.jsx', 'pages/Cachets.jsx']) {
      const source = lire(rel)
      expect(source, rel).toContain('const activiteFeed = selected ? (selected.operations ?? []) : activite')
      expect(source, rel).toContain('activiteFeed.map((a, i) =>')
    }
    const services = lire('pages/ServicesEnCours.jsx')
    expect(services).toContain('getServiceEnCours(selectedServiceId)')
    expect(services).toContain('const activiteFeed = selectedService ? serviceActivite : activite')
    expect(services).toContain('activiteFeed.map((a, i) =>')
  })

  it('plus de sélecteur d\'activité ni de retour « activité globale » : le fil est le fil simple, toutes activités affichées', () => {
    for (const [rel] of pages) {
      const source = lire(rel)
      expect(source, rel).not.toContain('unSeul')
      expect(source, rel).not.toContain("Revenir à l'activité globale")
      expect(source, rel).toContain('<FilActivite className="p-5 space-y-4">')
    }
    const fil = lire('components/ui/FilActivite.jsx')
    expect(fil).not.toContain('useState')
    expect(fil).not.toContain('<button')
    const activite = (n) => createElement('div', { key: n }, `Activité n°${n}`)
    const html = renderToStaticMarkup(createElement(FilActivite, null, [activite(1), activite(2), activite(3)]))
    for (const n of [1, 2, 3]) expect(html).toContain(`Activité n°${n}`)
  })

  it('les titres des panneaux restent ceux de la référence, complétés du nom de la ligne affichée', () => {
    for (const [rel, , titre] of pages) expect(lire(rel), rel).toContain(titre)
  })
})