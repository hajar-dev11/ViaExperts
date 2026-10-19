// Gestion des paiements : action « Ajouter un paiement », formulaire de la capture, historique complet (œil), reçu par ligne,
// colonnes Fichier / Observation et fond vert uniquement quand le service est soldé.
// Environnement Node : rendu serveur de l'état initial et analyse du texte des sources (les clics sont vérifiés dans le navigateur).
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AjouterPaiementModal from '../components/AjouterPaiementModal.jsx'
import { CelluleFichierPaiement } from '../components/CellulesPaiement.jsx'
import { urlFichierPaiement } from '../api/paiements.js'

const SRC = path.resolve(import.meta.dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')
const rendre = (element) => renderToStaticMarkup(element).replaceAll('&#x27;', "'")

describe('formulaire « Ajouter un paiement »', () => {
  const source = lire('components/AjouterPaiementModal.jsx')

  it('formulaire de la référence : Prix Restants, Prix Payé, Prix Rest (calculé), mode, date d\'opération, signature, pièce à jointe, observation', () => {
    const entetes = ['Prix Restants', 'Prix Payé', 'Prix Rest', "Date d'opération", 'pièce à jointe', 'Observation']
    const positions = entetes.map((e) => source.indexOf(`label="${e}"`))
    expect(positions.every((p) => p > -1), JSON.stringify(positions)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(source).toContain('<ModePaiementChamp') // « Mode de Paiement », avant la date
    expect(source.indexOf('<ModePaiementChamp')).toBeLessThan(source.indexOf('label="Date d\'opération"'))
    expect(source).toContain('title="Ajouter Un Paiement"')
    // Deux champs en lecture seule : le reste avant paiement (fourni par la gestion) et le reste après (calculé automatiquement).
    expect(source.match(/<Input readOnly/g)).toHaveLength(2)
    expect(source).toContain('value={String(restant)}')
    expect(source).toContain('value={restantApres.toFixed(2)}')
    expect(source).toContain('const restantApres = soldeRestant(restant, form.prix_paye)')
    expect(source).toContain('>Close<')
    expect(source).toContain('>Ajouter<')
  })

  it('affiche le reste de la ligne en lecture seule ; le prix payé est vide au départ et « Prix Rest » égale le reste', () => {
    const html = rendre(createElement(AjouterPaiementModal, { ligne: { paiementId: 7, prixTotal: '3000.00', prixPaye: '200.00', prixRestant: '2800.00' }, onClose() {}, onAjoute() {} }))
    expect(html).toContain('Ajouter Un Paiement')
    for (const valeur of ['2800', '2800.00']) {
      expect(html, valeur).toMatch(new RegExp(`readOnly=""[^>]*value="${valeur.replace('.', '\\.')}"|value="${valeur.replace('.', '\\.')}"[^>]*readOnly=""`))
    }
    expect(html).toContain('placeholder="Prix Payé (DH)"')
    expect(html).toContain('Mode de Paiement')
    expect(html).toContain('Ajouter la Signature')
    expect(html).toContain('pièce à jointe')
  })

  it('Prix Rest se recalcule seul : reste − prix payé, jamais négatif, au centime', async () => {
    const { soldeRestant } = await import('../utils/montants.js')
    expect(soldeRestant(2800, '')).toBe(2800)
    expect(soldeRestant(2800, '800')).toBe(2000)
    expect(soldeRestant(2800, '2800')).toBe(0)
    expect(soldeRestant(2800, '3000')).toBe(0)
    expect(soldeRestant(0.3, '0.1')).toBe(0.2)
  })

  it('refuse un montant nul, négatif ou supérieur au reste (contrôle avant tout envoi), sans modifier les paiements précédents', () => {
    expect(source).toContain('montant > 0')
    expect(source).toContain('const depasse = montant > restant + 0.004')
    expect(source).toContain('Saisissez un montant supérieur à 0.')
    expect(source).toContain('Le montant dépasse le reste à payer')
    // Le montant antérieur n'est jamais envoyé : l'ajout est une opération distincte.
    expect(source).not.toMatch(/prix_deja|dejaPaye\s*[,}]/)
  })

  it('n\'envoie que le NOUVEAU montant (jamais le déjà payé) vers l\'endpoint du paiement complémentaire', () => {
    expect(source).toContain('ajouterComplement(ligne.paiementId, payload)')
    expect(source).toContain('prix_paye: Number(form.prix_paye)')
    const api = lire('api/paiements.js')
    expect(api).toContain('/api/v1/paiements/${id}/complements')
  })
})

describe('« Gestion des paiements » : action, historique, reçus, couleurs', () => {
  const gestion = lire('pages/PaiementGestion.jsx')

  it('l\'action « Ajouter un paiement » n\'apparaît que pour un reste à payer > 0, sur les paiements actifs et avec le droit d\'ajout', () => {
    expect(gestion).toContain("label: 'Ajouter un paiement'")
    expect(gestion).toContain("hasPermission('paiements', 'ajouter_paiement')")
    expect(gestion).toContain('Number(r.prixRestant) > 0.004')
    // Masquée tant que la migration des compléments n'est pas appliquée (le serveur le signale ligne par ligne).
    expect(gestion).toContain('r.complementsPossibles !== false')
    const menu = gestion.slice(gestion.indexOf('const menuItems'), gestion.indexOf("if (status === 'archive')"))
    expect(menu).toContain("label: 'Ajouter un paiement'") // dans la branche « actif » uniquement
    // Le menu garde son icône à trois tirets.
    expect(gestion).toContain('icon={<IconeActions />}')
  })

  it('le fond est rouge si l\'échéance est dépassée avec un reste (serveur), vert seulement si soldé, orange sinon', () => {
    const regle = gestion.slice(gestion.indexOf('const rowClassName'), gestion.indexOf('const exportColumns'))
    expect(regle).toContain("if (r.enRetard) return 'bg-danger-200'")
    expect(regle).toContain("(r.regle ?? Number(r.prixRestant) <= 0.004) ? 'bg-success-100' : 'bg-warning-100'")
    // Le rouge passe avant les autres couleurs ; tout le tableau reçoit la couleur de LA LIGNE (pas de cellule isolée).
    expect(regle.indexOf('bg-danger-200')).toBeLessThan(regle.indexOf('bg-success-100'))
    expect(gestion).toContain('rowClassName={rowClassName}')
  })

  it('un message informatif explique pourquoi « Ajouter un paiement » est masqué tant que la migration n\'est pas appliquée', () => {
    expect(gestion).toContain('const migrationAbsente = rows.length > 0 && rows.every((r) => r.complementsPossibles === false)')
    expect(gestion).toContain('2026_10_15_100000_add_paiement_origine_to_paiements_table')
  })

  it('l\'œil charge l\'historique complet (une ligne par paiement) et chaque ligne a son propre reçu', () => {
    expect(gestion).toContain('getHistorique(paiementId)')
    expect(gestion).toContain('rows={focusedId != null ? (historique ?? []) : visibles}')
    expect(gestion).toContain('onClick={() => setChoixRecu(r)}')
    expect(gestion).toContain('imprimerRecuPaiementPdf(paiement, format)')
    // Plus de chargement d'un seul paiement pour l'œil.
    expect(gestion).not.toContain('getPaiement(')
  })

  it('les colonnes Fichier et Observation utilisent les cellules partagées (téléchargement contrôlé, texte complet en fenêtre)', () => {
    for (const rel of ['pages/PaiementGestion.jsx', 'pages/PaiementList.jsx']) {
      const source = lire(rel)
      expect(source, rel).toContain('<CelluleFichierPaiement paiement={r} />')
      expect(source, rel).toContain('observation.cellule')
      expect(source, rel).toContain('{observation.modale}')
      expect(source, rel).not.toContain('/storage/') // plus de lien public vers le fichier
    }
  })
})

describe('« Liste des paiements » : aucune coloration conditionnelle des lignes', () => {
  const liste = lire('pages/PaiementList.jsx')

  it('plus de rowClassName ni de couleur rouge / orange / verte ; fond blanc uniforme', () => {
    expect(liste).not.toContain('rowClassName')
    for (const couleur of ['bg-danger-', 'bg-warning-', 'bg-success-']) expect(liste, couleur).not.toContain(couleur)
    expect(liste).toContain('striped={false}')
  })

  it('les colonnes, filtres et actions de la liste sont conservés', () => {
    for (const element of ['Prix Restant', 'Montant Paye', "label=\"Tous les responsables\"".replace('label="', '').replace('"', ''), 'ExportMenu', 'ChoixFormatRecu', 'menuItems(r)']) {
      expect(liste, element).toContain(element)
    }
    // Les autres pages de paiements gardent leur propre règle de couleur (Gestion des paiements).
    expect(lire('pages/PaiementGestion.jsx')).toContain("if (r.enRetard) return 'bg-danger-200'")
  })
})

describe('plus d\'action « Modifier » sur les paiements', () => {
  it('ni dans « Gestion des paiements » ni dans « Liste des paiements » ; les autres actions du menu sont conservées', () => {
    for (const rel of ['pages/PaiementGestion.jsx', 'pages/PaiementList.jsx']) {
      const source = lire(rel)
      const menu = source.slice(source.indexOf('const menuItems'), source.indexOf('return (\n    <div>'))
      expect(menu, rel).not.toContain("label: 'Modifier',")
      expect(menu, rel).not.toContain('/modifier')
      expect(source, rel).not.toContain('IconeModifier')
      for (const action of ["label: 'Archiver'", "label: 'Restaurer'", "label: 'Supprimer définitivement'"]) expect(menu, `${rel} ${action}`).toContain(action)
    }
    // « Modifier la date de crédit » (échéance) reste disponible dans la gestion ; « Ajouter un paiement » aussi.
    const gestion = lire('pages/PaiementGestion.jsx')
    expect(gestion).toContain("label: 'Modifier la date de crédit'")
    expect(gestion).toContain("label: 'Ajouter un paiement'")
  })
})

describe('reçu d\'un paiement complémentaire', () => {
  const identite = { logo: '', nomSociete: 'Via Experts', signature: null, afficherPiedSurRecu: false }
  // Les trois paiements d'un service de 3 000 Dh : chaque reçu porte son montant et le reste APRÈS ce paiement.
  const paiements = [
    { id: 1, reference: '#1', client: 'CLIENT TEST', total: '3000.00', prixPaye: '1000.00', prixRestant: '2000.00', dateOperation: '2026-10-01 10:00:00' },
    { id: 3, reference: '#3', client: 'CLIENT TEST', total: '3000.00', prixPaye: '1000.00', prixRestant: '1000.00', dateOperation: '2026-10-10 10:00:00' },
    { id: 4, reference: '#4', client: 'CLIENT TEST', total: '3000.00', prixPaye: '1000.00', prixRestant: '0.00', dateOperation: '2026-10-15 10:00:00' },
  ]

  it('le reçu de chaque ligne ne contient que sa référence, son montant payé et son reste — pas ceux des autres', async () => {
    const { construireHtmlRecuPdf } = await import('../modules/paiements/print/recuPaiement.js')
    // Espaces (dont insécables) retirés : « 2 000,00 DH » → « 2000,00DH ».
    const recus = paiements.map((p) => construireHtmlRecuPdf(p, identite, 'a5').bodyHtml.replace(/[\s  ]/g, ''))

    expect(recus[0]).toContain('#1')
    expect(recus[0]).toContain('<td>2000,00DH</td>') // reste après le 1er paiement
    expect(recus[0]).not.toContain('#3')
    expect(recus[1]).toContain('#3')
    expect(recus[1]).toContain('<td>1000,00DH</td>')
    expect(recus[1]).not.toContain('#1')
    expect(recus[2]).toContain('#4')
    expect(recus[2]).toContain('<td>0,00DH</td>') // service soldé : plus rien à payer
    expect(recus[2]).not.toContain('#3')
  })
})

describe('colonne « Fichier »', () => {
  it('icône de téléchargement vers l\'API seulement s\'il existe un fichier ; sinon un tiret', () => {
    const avec = rendre(createElement(CelluleFichierPaiement, { paiement: { id: 12, aFichier: true, pieceJointeNom: 'recu.pdf', reference: '#12' } }))
    expect(avec).toContain(`href="${urlFichierPaiement(12)}"`)
    expect(avec).toContain('recu.pdf')
    expect(avec).toContain('<svg')

    const sans = rendre(createElement(CelluleFichierPaiement, { paiement: { id: 13, aFichier: false } }))
    expect(sans).not.toContain('<a')
    expect(sans).not.toContain('<svg')
    expect(sans).toContain('—')
  })

  it('l\'adresse de téléchargement est celle du paiement concerné', () => {
    expect(urlFichierPaiement(5)).toMatch(/\/api\/v1\/paiements\/5\/fichier$/)
    expect(urlFichierPaiement(6)).not.toBe(urlFichierPaiement(5))
  })
})
