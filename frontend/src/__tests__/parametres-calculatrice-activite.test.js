// Paramètres pleine largeur, filtres/recherche centrés, Assistance (fonction libre, suppression), calculatrices de la barre du
// haut, formulaire de paiement et fils d'activité à hauteur limitée.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FilActivite from '../components/ui/FilActivite.jsx'
import { calculerTva } from '../utils/calculTva.js'
import { filtrerOptions, normaliserRecherche } from '../utils/rechercheOptions.js'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('Paramètres : champs sur toute la largeur', () => {
  const parametres = lire('pages/Parametres.jsx')

  it('plus aucune largeur plafonnée (max-w-3xl / max-w-xl) sur Account, Bureau de comptabilité et Centre de domiciliation', () => {
    expect(parametres).not.toContain('max-w-3xl')
    expect(parametres).not.toContain('max-w-xl')
  })

  it('la disposition est en colonnes qui s\'adaptent à l\'écran (logo | signature, 3 colonnes, numérotations | adresse)', () => {
    expect(parametres).toContain('grid sm:grid-cols-2 gap-6')
    expect(parametres).toContain('grid sm:grid-cols-3 gap-5')
  })

  it('Paramètres → Compte : champs les uns sous les autres, chacun sur toute la largeur (comme « Nom de société »)', () => {
    const compte = parametres.slice(parametres.indexOf('function AccountTab'), parametres.indexOf('const FONCTIONS'))
    expect(compte).not.toContain('grid-cols')
    expect(compte).toContain('<form onSubmit={saveProfile} className="w-full space-y-5">')
    expect(compte).toContain('<form onSubmit={savePassword} className="w-full space-y-5">')
    expect(compte.match(/<div className="space-y-5">/g)).toHaveLength(2)
  })

  it('Paramètres → Services, Cachet et Mail : plus de bouton « Gérer … » ; les gestionnaires de statuts restent', () => {
    expect(parametres).not.toMatch(/Gérer les (Services|Cachets|Mails)/)
    expect(parametres).not.toContain('manageLink')
    expect(parametres).toContain('serviceStatusApi')
    expect(parametres).toContain('cachetStatusApi')
    expect(parametres).toContain('mailStatusApi')
    expect((parametres.match(/<StatusManagerTab/g) ?? []).length).toBe(3)
  })
})

describe('filtres et recherche centrés', () => {
  const table = lire('components/ui/Table.jsx')

  it('la recherche est large et centrée (grille 3 zones à partir de xl), compacte et pleine largeur en dessous', () => {
    expect(table).toContain('xl:grid-cols-[1fr_minmax(0,40rem)_1fr]')
    expect(table).toContain('2xl:grid-cols-[1fr_minmax(0,52rem)_1fr]')
    expect(table).toContain('max-xl:basis-full')
    expect(table).not.toMatch(/type="search"[\s\S]{0,400}max-w-xs/)
  })

  it('« filterCentre » place le filtre au centre de l\'en-tête de carte ; actif sur les listes à vrais filtres', () => {
    expect(table).toContain('filterCentre')
    for (const rel of [
      'modules/facturation/pages/DocumentList.jsx', 'pages/EntreprisesList.jsx', 'pages/PaiementList.jsx',
      'pages/PaiementGestion.jsx', 'pages/DeclarationTVA.jsx',
    ]) expect(lire(rel), rel).toMatch(/^\s+filterCentre$/m)
    // Les pages dont le « filtre » n'est qu'un bouton « Retour » restent inchangées.
    expect(lire('pages/ClientsList.jsx')).not.toContain('filterCentre')
  })
})

describe('Assistance', () => {
  const parametres = lire('pages/Parametres.jsx')
  const assistance = parametres.slice(parametres.indexOf('function AssistanceTab'), parametres.indexOf('function NumberingRow'))

  it('l\'option « Gérer les Centres de Domiciliation » n\'existe plus dans la page Assistance', () => {
    expect(assistance).not.toMatch(/G[ée]rer les Centres/i)
    expect(assistance).not.toContain('to="/domiciliation/centres"')
  })

  it('la fonction est une saisie libre (champ texte + suggestions), plus une liste fermée', () => {
    expect(assistance).toContain('list="assistance-fonctions"')
    expect(assistance).toContain('maxLength={30}')
    expect(assistance).not.toMatch(/<Select[^>]*fonction/)
  })

  it('une suppression avec confirmation est proposée dans la colonne Actions (jamais pour son propre compte)', () => {
    expect(assistance).toContain('title="Supprimer"')
    expect(assistance).toContain('r.id !== user?.id')
    expect(assistance).toContain('<ConfirmDialog')
    expect(assistance).toContain('await deleteUser(cible.id)')
  })
})

describe('Calculateur de TVA (fenêtre) : règles de calcul', () => {
  it('HT saisi : TVA = HT × taux, TTC = HT + TVA, arrondis au centime', () => {
    expect(calculerTva('ht', '100', '20')).toEqual({ ht: 100, tva: 20, ttc: 120 })
    expect(calculerTva('ht', '104.17', '20')).toEqual({ ht: 104.17, tva: 20.83, ttc: 125 })
  })

  it('TTC saisi : HT = TTC ÷ (1 + taux)', () => {
    expect(calculerTva('ttc', '120', '20')).toEqual({ ht: 100, tva: 20, ttc: 120 })
    expect(calculerTva('ttc', '110', '10')).toEqual({ ht: 100, tva: 10, ttc: 110 })
  })

  it('TVA saisie : HT = TVA ÷ taux ; sans taux, impossible de remonter au HT', () => {
    expect(calculerTva('tva', '20', '20')).toEqual({ ht: 100, tva: 20, ttc: 120 })
    expect(calculerTva('tva', '20', '0')).toEqual({ ht: 0, tva: 20, ttc: 20 })
  })

  it('valeur vide, négative ou invalide : zéros', () => {
    expect(calculerTva('ht', '', '20')).toEqual({ ht: 0, tva: 0, ttc: 0 })
    expect(calculerTva('ht', '-5', '20')).toEqual({ ht: 0, tva: 0, ttc: 0 })
    expect(calculerTva('ttc', 'abc', '20')).toEqual({ ht: 0, tva: 0, ttc: 0 })
  })

  it('la fenêtre reprend la référence : titre, taux en %, trois montants (TVA, HT, TTC) en Dh, bouton de fermeture, très large', () => {
    const panneau = lire('components/TvaCalculatorPanel.jsx')
    expect(panneau).toContain('title="Calculateur de TVA"')
    expect(panneau).toContain('Montant Tva')
    expect(panneau).toContain('Montant HT')
    expect(panneau).toContain('Montant TTC')
    expect(panneau).toContain('>Dh<')
    expect(panneau).toContain('size="wide"')
    expect(lire('components/ui/Modal.jsx')).toContain("wide: 'max-w-6xl 2xl:max-w-[88rem]'")
    const topbar = lire('components/Topbar.jsx')
    expect(topbar).toContain('<TvaCalculatorPanel open={tvaOuvert}')
  })
})

describe('Calculatrice : opération complète affichée', () => {
  const calc = lire('components/CalculatorPanel.jsx')

  it('affiche « 4 + 2 = 6 » : une ligne d\'opération au-dessus du résultat, zone d\'affichage agrandie', () => {
    expect(calc).toContain('setDerniere(`${stored} ${operator} ${display} = ${result}`)')
    expect(calc).toContain('data-testid="calc-operation"')
    expect(calc).toContain('data-testid="calc-resultat"')
    expect(calc).toContain('min-h-[5.75rem]')
    expect(calc).toContain('w-72')
  })

  it('les règles de calcul existantes sont conservées', () => {
    expect(calc).toContain("case '÷': return y === 0 ? NaN : x / y")
    expect(calc).toContain('const percent = () => setDisplay((v) => String(parseFloat(v) / 100))')
  })
})

describe('bandeau d\'alerte domiciliation : clignotant', () => {
  it('le bandeau clignote (fond seulement, lisibilité conservée) ; conditions d\'affichage inchangées', () => {
    expect(lire('components/Topbar.jsx')).toContain('className="ve-clignote hidden')
    const css = lire('index.css')
    expect(css).toContain('@keyframes ve-clignote')
    expect(css).toMatch(/\.ve-clignote:hover\s*\{\s*animation-play-state: paused/)
    expect(lire('components/Topbar.jsx')).toContain('calculerAlertesEcheance(')
  })
})

describe('Ajouter un paiement : disposition de la référence', () => {
  const form = lire('pages/PaiementForm.jsx')

  it('trois colonnes : tiers | date d\'opération | date crédit, puis mode | signature | services', () => {
    expect(form).toContain('md:grid-cols-2 lg:grid-cols-3')
    const ordre = ['Entreprises" checked', 'label="Date d\'opération"', 'label="Date Crédit"', '<ModePaiementChamp', '<ChampSignature', '>Services <'].map((t) => form.indexOf(t))
    expect(ordre.every((p) => p > -1)).toBe(true)
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre)
  })

  it('le champ « Facture à régler » est retiré ; les autres champs métier sont conservés', () => {
    expect(form).not.toContain('Facture à régler')
    expect(form).not.toContain('choisirFacture')
    expect(form).not.toContain('facturesProposees')
    for (const t of ['label="Pièce jointe"', 'label="Observation"', 'Prix à payer (ce paiement)', 'Solde restant après ce paiement',
      'document_id: form.document_id', 'createPaiement(payload)', 'updatePaiement(id, payload)']) {
      expect(form, t).toContain(t)
    }
  })

  it('« Total HT » remplace « Total des lignes (HT) » ; le champ « Déjà payé » est supprimé (le déjà payé se déduit des paiements)', () => {
    expect(form).toContain("'Total HT'")
    expect(form).not.toContain('Total des lignes')
    expect(form).not.toContain('Total ligne HT')
    expect(form).not.toContain('Déjà payé')
    expect(form).not.toContain('prix_deja_paye')
    // Le montant envoyé reste le seul montant de CE paiement.
    expect(form).toContain('prix_paye: form.prix_paye')
  })
})

describe('fils d\'activité : toutes les activités, sans bouton ni barre de défilement', () => {
  const activite = (n) => createElement('div', { key: n, 'data-act': n }, `Activité ${n}`)
  const rendre = (nb) => renderToStaticMarkup(createElement(FilActivite, { className: 'p-5' }, Array.from({ length: nb }, (_, i) => activite(i + 1))))

  it('affiche toutes les activités, dans l\'ordre, sans bouton « Afficher les autres activités »', () => {
    const html = rendre(4)
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`Activité ${n}`)
    expect(html.indexOf('Activité 1')).toBeLessThan(html.indexOf('Activité 4'))
    expect(html).not.toContain('<button')
    expect(html).not.toContain('Afficher les')
    expect(html).not.toContain('aria-expanded')
  })

  it('fil vide : le conteneur ne contient rien', () => {
    expect(renderToStaticMarkup(createElement(FilActivite, null, []))).not.toContain('<div role="region"><')
  })

  it('aucun mécanisme de défilement vertical ni de repli : ni overflow, ni hauteur maximale, ni état', () => {
    const fil = lire('components/ui/FilActivite.jsx')
    for (const interdit of ['overflow', 'max-h-', 'scrollTop', 'ResizeObserver', 'useState', 'Réduire', 'Afficher les']) {
      expect(fil, interdit).not.toContain(interdit)
    }
  })

  it('une activité qui connaît sa position garde sa valeur « dernier » (le trait relie bien toutes les activités)', () => {
    const Item = ({ dernier }) => createElement('div', { 'data-dernier': String(dernier) }, 'item')
    const html = renderToStaticMarkup(createElement(FilActivite, null, [
      createElement(Item, { key: 1, dernier: false }), createElement(Item, { key: 2, dernier: true }),
    ]))
    expect(html).toContain('data-dernier="false"')
    expect(html).toContain('data-dernier="true"')
  })

  it('Services en cours, Cachet, Mail, Accueil et le détail d\'un service l\'utilisent', () => {
    for (const rel of ['pages/ServicesEnCours.jsx', 'pages/Cachets.jsx', 'pages/Mails.jsx', 'pages/Dashboard.jsx', 'components/ServiceEnCoursActions.jsx']) {
      const source = lire(rel)
      expect(source, rel).toContain('<FilActivite')
      expect(source, rel).toContain('</FilActivite>')
      expect(source, rel).toContain("import FilActivite from")
    }
  })
})

describe('calculateur de TVA : position', () => {
  it('la fenêtre est remontée vers le haut de l\'écran (position="haut"), sans changer son design ni ses calculs', () => {
    expect(lire('components/TvaCalculatorPanel.jsx')).toContain('size="wide" position="haut"')
    const modal = lire('components/ui/Modal.jsx')
    expect(modal).toContain("position = 'center'")
    expect(modal).toContain("items-start pt-[5vh]")
    // Les autres fenêtres gardent le centrage vertical.
    expect(modal).toContain(": 'items-center'")
  })
})

describe('Listes de la Facturation : présentation neutre', () => {
  it('ni orange ni vert selon le reste à payer, pour toutes les listes (devis, factures, bons de livraison, avoirs)', () => {
    const liste = lire('modules/facturation/pages/DocumentList.jsx')
    expect(liste).not.toContain('rowClassName')
    expect(liste).not.toContain('striped=')
    expect(liste).not.toContain('bg-warning-200')
    expect(liste).not.toContain('bg-success-200')
    // Le montant reste affiché, sans calcul ni couleur propre.
    expect(liste).toContain('<span className="font-semibold text-ink-900">{dh(r.prixRestant)}</span>')
  })
})

describe('option « signature » : libellés explicites', () => {
  it('Facturation : le libellé nomme le document (devis, facture, bon de livraison, facture d\'avoir)', () => {
    const form = lire('modules/facturation/pages/DocumentForm.jsx')
    for (const t of ['Ajouter une signature sur la facture', 'Ajouter une signature sur le devis', 'Ajouter une signature sur le bon de livraison', "Ajouter une signature sur la facture d'avoir"]) {
      expect(form, t).toContain(t)
    }
    expect(form).toContain('texte={SIGNATURE_TEXTE[type] ?? SIGNATURE_TEXTE.facture}')
  })

  it('Paiement : reçu ; domiciliation : facture, contrat et attestation (la procuration n\'a jamais de signature)', () => {
    expect(lire('pages/PaiementForm.jsx')).toContain('Ajouter une signature sur le reçu de paiement')
    expect(lire('components/ChampSignature.jsx')).toContain("Ajouter une signature sur la facture, le contrat et l'attestation")
    expect(lire('pages/EntrepriseForm.jsx')).toContain("Ajouter une signature sur la facture, le contrat et l'attestation")
  })

  it('le comportement ne change pas : même valeur par défaut, même propriété envoyée', () => {
    expect(lire('modules/facturation/pages/DocumentForm.jsx')).toContain("signature: form.signature")
    expect(lire('modules/facturation/pages/DocumentForm.jsx')).toContain("signature: true, note: ''")
    expect(lire('pages/PaiementForm.jsx')).toContain('signature: form.signature')
  })
})

describe('Facturation : recherche d\'une entreprise ou d\'un client', () => {
  const options = [
    { cle: 'Entreprises-1', value: 1, label: 'Société Atlas SARL', groupe: 'Entreprises' },
    { cle: 'Entreprises-2', value: 2, label: 'ENT NORMALE', groupe: 'Entreprises' },
    { cle: 'Clients-1', value: 1, label: 'Karim Alaoui', groupe: 'Clients' },
  ]

  it('la recherche ignore la casse et les accents, sur le nom (entreprise ou client) et sur le groupe', () => {
    expect(normaliserRecherche('Société')).toBe('societe')
    expect(filtrerOptions(options, 'societe atlas').map((o) => o.cle)).toEqual(['Entreprises-1'])
    expect(filtrerOptions(options, 'ALAOUI').map((o) => o.cle)).toEqual(['Clients-1'])
    expect(filtrerOptions(options, 'client').map((o) => o.cle)).toEqual(['Clients-1'])
    expect(filtrerOptions(options, '   ')).toHaveLength(3)
    expect(filtrerOptions(options, 'zzz')).toEqual([])
  })

  it('la valeur enregistrée est l\'identifiant du résultat choisi, jamais le texte tapé', () => {
    const composant = lire('components/SelectRecherche.jsx')
    expect(composant).toContain('onChange(String(option.value))')
    expect(composant).toContain('role="combobox"')
    expect(composant).toContain('role="listbox"')
    // Entrée choisit le résultat actif sans envoyer le formulaire.
    expect(composant).toMatch(/key === 'Enter' && ouvert\) \{\s*\/\/[^\n]*\n\s*e\.preventDefault\(\)/)
    // Champ requis : validé sur l'identifiant (champ caché), pas sur le texte.
    expect(composant).toContain('value={valeurTexte}')
  })

  it('le formulaire de Facturation l\'utilise à la place de la liste simple, avec les mêmes tiers (entreprises et clients)', () => {
    const form = lire('modules/facturation/pages/DocumentForm.jsx')
    expect(form).toContain('<SelectRecherche')
    expect(form).toContain("set('party_id')({ target: { value: valeur } })")
    expect(form).toContain("label: t.label, groupe: t.groupe")
    expect(form).not.toContain('Sélectionner Entreprise/Client</option>')
  })

  it('largeur : 4 colonnes pour la Facture, 3 pour Devis / BL / Avoir (plus de cases vides)', () => {
    expect(lire('modules/facturation/pages/DocumentForm.jsx')).toContain("avecPaiement ? 'lg:grid-cols-4' : 'lg:grid-cols-3'")
  })
})

describe('formulaires Ajouter un document / Observation : très grande largeur', () => {
  it('les 8 fenêtres (4 pages × 2) sont en largeur xxl, comme le formulaire de domiciliation, champs côte à côte sur grand écran', () => {
    for (const rel of ['components/BlocsEntreprise.jsx', 'pages/EntreprisesList.jsx', 'modules/domiciliation/pages/DomiciliationDetails.jsx', 'modules/domiciliation/pages/DomiciliationList.jsx']) {
      const s = lire(rel)
      expect(s.match(/size="xxl"/g)?.length, rel).toBeGreaterThanOrEqual(2)
      expect(s.match(/grid gap-5 lg:grid-cols-2/g)?.length, rel).toBeGreaterThanOrEqual(2)
      expect(s, rel).toContain('lg:col-span-2')
    }
  })
})

describe('toute l\'application : chaque sélection d\'entreprise ou de client permet de rechercher en écrivant', () => {
  const PAGES = [
    'modules/facturation/pages/DocumentForm.jsx', 'pages/PaiementForm.jsx', 'pages/Cachets.jsx', 'pages/Mails.jsx',
    'pages/DeclarationTVA.jsx', 'pages/ImportateurTvaFichier.jsx', 'modules/domiciliation/pages/DomiciliationForm.jsx',
    'pages/EntrepriseForm.jsx', 'pages/ServicesEnCours.jsx',
  ]

  it('les 9 formulaires utilisent la recherche (SelectRecherche) et plus de liste simple pour choisir une entreprise ou un client', () => {
    for (const rel of PAGES) {
      const s = lire(rel)
      expect(s, rel).toContain('<SelectRecherche')
      expect(s, rel).toContain("import SelectRecherche from")
      // Plus de <option> qui énumère les entreprises / clients dans une liste simple.
      expect(s, rel).not.toMatch(/(entreprises|clients|tiers)\.map\(\([a-z]+\) => <option/)
    }
  })

  it('les valeurs enregistrées sont inchangées : identifiant (nom du client pour la fiche Entreprise)', () => {
    expect(lire('pages/EntrepriseForm.jsx')).toContain('optionsClients(clients, (c) => c.nom)')
    expect(lire('pages/ServicesEnCours.jsx')).toContain('optionsClients(clients)')
    expect(lire('pages/DeclarationTVA.jsx')).toContain('optionsEntreprises(entreprises)')
  })
})
