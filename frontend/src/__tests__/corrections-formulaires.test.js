// Corrections de formulaires : numéro automatique, mode de paiement « Autre » en un seul champ, alignement de « Prix à payer »,
// remise en montant, « Nouvelle Domiciliation » réorganisée, formulaire de renouvellement, fiche domiciliation, blocs repliés
// des fiches Client / Entreprise et typographie centralisée.
// Environnement Node : rendu serveur de l'état initial et analyse du texte des sources (les clics sont vérifiés dans le navigateur).
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ModePaiementChamp from '../components/ModePaiementChamp.jsx'
import ChampSignature from '../components/ChampSignature.jsx'
import CarteBloc from '../components/CarteBloc.jsx'
import DomiciliationForm from '../modules/domiciliation/pages/DomiciliationForm.jsx'
import { formaterMontant, remiseEnDh } from '../utils/montants.js'
import { clientIfApresChoix } from '../utils/rechercheOptions.js'
import { Folder } from 'lucide-react'

const SRC = path.resolve(import.meta.dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')
const rendre = (element) => renderToStaticMarkup(element).replaceAll('&#x27;', "'")

describe('1. numéro automatique de l\'émetteur', () => {
  const source = lire('modules/facturation/pages/DocumentForm.jsx')

  it('le champ et la numérotation automatique sont conservés ; seul le texte d\'aide sous le champ a disparu', () => {
    expect(source).not.toContain('Numéro automatique de l\'émetteur choisi (modifiable)')
    expect(source).toContain('<Field label="Numéro" required>')
    expect(source).toContain('chargerProposition(emetteur)') // proposition du numéro à chaque changement d'émetteur
    expect(source).toContain('setNumeroAuto(false)') // modifiable à la main
    expect(source).toContain('numero_auto: true')
  })
})

describe('2. mode de paiement « Autre » : un seul champ', () => {
  const rendu = (value) => rendre(createElement(ModePaiementChamp, { value, onChange: () => {} }))

  it('mode de la liste : une liste déroulante, aucun champ de précision', () => {
    const html = rendu('Virement')
    expect(html.match(/<select/g)).toHaveLength(1)
    expect(html).not.toContain('Précisez le mode de paiement')
  })

  it('« Autres à déterminer » : la liste laisse la place à la SAISIE dans le même champ (pas de deuxième champ)', () => {
    const html = rendu('Autres à déterminer')
    expect(html).not.toContain('<select')
    expect(html.match(/<input/g)).toHaveLength(1)
    expect(html).toContain('placeholder="Précisez le mode de paiement"')
    expect(html.match(/Mode de Paiement/g)).toHaveLength(1) // un seul libellé, un seul champ
  })

  it('valeur enregistrée « Autre : Mandat » : le champ s\'ouvre directement sur la précision (consultation / modification)', () => {
    const html = rendu('Autre : Mandat')
    expect(html).toContain('value="Mandat"')
    expect(html.match(/<input/g)).toHaveLength(1)
    expect(html).toContain('Revenir à la liste des modes de paiement')
  })

  it('l\'icône du formulaire est conservée dans le champ de saisie', () => {
    const html = rendre(createElement(ModePaiementChamp, { value: 'Autre : X', onChange: () => {}, icon: createElement('i', { 'data-icone': 'oui' }) }))
    expect(html).toContain('data-icone="oui"')
    expect(html).not.toContain('Autre :</span>') // le préfixe n'est utile que sans icône
  })
})

describe('3. alignement de « Prix à payer (TTC) »', () => {
  const source = lire('modules/facturation/pages/DocumentForm.jsx')

  it('même gabarit que les autres champs : libellé 15 px, boîte de 44 px (h-11), alignés sur une même ligne', () => {
    expect(source).toContain('mb-1.5 block text-[15px] font-medium text-ink-800')
    expect(source).toContain('flex h-11 items-center rounded-lg border px-3.5 text-[15px]')
    expect(source).not.toMatch(/flex h-10 items-center/)
    expect(source).toContain('className="grid items-start gap-x-4 gap-y-3 mt-3 sm:grid-cols-3"')
  })

  it('plus de texte d\'aide sous le champ (il décalait la ligne) : l\'info-bulle le remplace', () => {
    const bloc = source.slice(source.indexOf("label={isEdit ? 'Prix payé (déjà réglé)' : 'Prix à payer (TTC)'}") - 40)
    expect(bloc.slice(0, 300)).not.toContain('hint=')
    expect(bloc).toContain('title={isEdit ? undefined')
  })
})

describe('5. remise en montant', () => {
  const source = lire('modules/facturation/pages/DocumentForm.jsx')

  it('plafonnée au total HT de la ligne, jamais négative, vide = 0', () => {
    expect(remiseEnDh('30', 200)).toBe(30)
    expect(remiseEnDh('500', 200)).toBe(200)
    expect(remiseEnDh('-5', 200)).toBe(0)
    expect(remiseEnDh('', 200)).toBe(0)
    expect(remiseEnDh('abc', 200)).toBe(0)
    expect(remiseEnDh('12,5', 200)).toBe(12.5)
  })

  it('colonne « Remise (Dh) » : plus de symbole %, montant envoyé au serveur, ancien pourcentage jamais reconverti', () => {
    expect(source).toContain("'Remise (Dh)'")
    expect(source).not.toContain("'Remise %'")
    expect(source).toContain('remise_montant: remiseLigne(')
    expect(source).toContain('remise_pourcent: 0')
    expect(source).toContain('remise: l.remiseMontant ?? 0') // ligne historique : équivalent en Dh affiché, rien n'est converti en base
    expect(source).not.toMatch(/n\(l\.remise_pourcent\)/)
  })

  it('une remise supérieure au total HT de la ligne bloque l\'envoi avec un message clair', () => {
    expect(source).toContain('ne peut pas dépasser son total HT')
    expect(source).toContain('Merci de corriger les remises en rouge')
  })

  it('le document imprimé affiche la remise en Dh (total HT − net HT), sans pourcentage', () => {
    const impression = lire('modules/facturation/print/documentCommercial.js')
    expect(impression).toContain('dh(l.totalHt - l.totalNetHt)')
  })
})

describe('6. « Nouvelle Domiciliation »', () => {
  const html = rendre(createElement(MemoryRouter, null, createElement(DomiciliationForm)))
  const position = (texte) => html.indexOf(texte)

  it('plus d\'ancienne date de début / fin ni d\'ancien prix HT', () => {
    expect(html).not.toContain('Ancienne date')
    expect(html).not.toContain('Ancien prix')
  })

  it('« Entreprise » est le tout premier champ ; vient ensuite « Date de départ » puis « Date de fin », avant « Mois payés »', () => {
    expect(position('Entreprise')).toBeGreaterThan(-1)
    expect(position('Entreprise')).toBeLessThan(position('Date de départ'))
    expect(position('Date de départ')).toBeLessThan(position('Date de fin'))
    expect(position('Date de fin')).toBeLessThan(position('Mois payés'))
  })

  it('le bloc « Domiciliations ajoutées » est centré dans son cadre', () => {
    const source = lire('modules/domiciliation/pages/DomiciliationForm.jsx')
    expect(source).toContain('mb-3 text-center text-xl text-ink-900">Domiciliations ajoutées')
    expect(source).toContain('<div className="rounded-xl bg-white shadow-card">')
  })

  it('« Entreprise » occupe toute la largeur, libellé AU-DESSUS du champ', () => {
    const source = lire('modules/domiciliation/pages/DomiciliationForm.jsx')
    expect(source).toContain('<Field label="Entreprise" required htmlFor="d-entreprise"')
    expect(source).not.toContain('<FieldRow label="Entreprise"')
  })

  it('« Mois payés » démarre à 0 ; prix par mois 104,17 par défaut', () => {
    expect(html).toMatch(/<input[^>]*type="number"[^>]*min="0"[^>]*required=""[^>]*value="0"/)
    expect(html).toContain('value="104.17"')
    expect(html).toContain('Valeur par défaut : 104,17 Dh HT.')
  })

  it('« Signature sur facture » : même composant partagé, centré', () => {
    expect(html).toContain('Ajouter une signature sur la facture, le contrat et l')
    expect(html).toContain('attestation</span>')
    expect(html).toContain('justify-center')
    const source = lire('modules/domiciliation/pages/DomiciliationForm.jsx')
    expect(source).toContain('<ChampSignature checked={form.signature_sur_facture}')
  })

  it('la signature a la même présentation partout (composant unique)', () => {
    for (const rel of ['modules/domiciliation/pages/DomiciliationForm.jsx', 'modules/domiciliation/components/DomiciliationActions.jsx',
      'pages/EntrepriseForm.jsx', 'pages/PaiementForm.jsx', 'modules/facturation/pages/DocumentForm.jsx']) {
      expect(lire(rel), rel).toContain('<ChampSignature')
    }
    const champ = rendre(createElement(ChampSignature, { checked: true, onChange: () => {} }))
    expect(champ).toContain('min-h-11')
    expect(champ).toContain('justify-center')
    expect(champ).toContain('checked=""')
  })
})

describe('6. affichage des montants sans zéros décimaux inutiles', () => {
  it('104 → « 104 », 104,17 → « 104,17 », 104,10 → « 104,1 »', () => {
    expect(formaterMontant(104)).toBe('104')
    expect(formaterMontant('104.00')).toBe('104')
    expect(formaterMontant('104.17')).toBe('104,17')
    expect(formaterMontant(104.1)).toBe('104,1')
    expect(formaterMontant('104,17')).toBe('104,17')
  })

  it('sépare les milliers, respecte la précision réelle (jamais d\'arrondi caché), vide → « — »', () => {
    expect(formaterMontant('1250.04').replace(/\s/g, ' ')).toBe('1 250,04')
    expect(formaterMontant(1250).replace(/\s/g, ' ')).toBe('1 250')
    expect(formaterMontant('0.5')).toBe('0,5')
    expect(formaterMontant(0)).toBe('0')
    expect(formaterMontant('')).toBe('—')
    expect(formaterMontant(null)).toBe('—')
    expect(formaterMontant('abc')).toBe('—')
  })

  it('utilisé sur les fiches et listes de domiciliation et de services', () => {
    for (const rel of ['modules/domiciliation/pages/DomiciliationDetails.jsx', 'components/BlocsEntreprise.jsx', 'pages/ServicesList.jsx']) {
      expect(lire(rel), rel).toContain('formaterMontant(')
    }
  })
})

describe('8. fiche « Informations Domiciliation » : trois actions', () => {
  const source = lire('modules/domiciliation/pages/DomiciliationDetails.jsx')
  // Le JSX des boutons seulement (le commentaire qui les précède cite les actions déplacées).
  const actions = source.slice(source.indexOf('<div className="mt-6 flex flex-wrap items-center gap-3 border-t'), source.indexOf('Colonne droite'))

  it('seulement Modifier, Archiver et Corbeille (Restaurer hors des actives, comportement existant)', () => {
    for (const libelle of ['Modifier', 'Archiver', 'Corbeille', 'Restaurer']) expect(actions).toContain(libelle)
    for (const libelle of ['Renouveler', 'Activer', 'Déclary', 'Déclarée', 'Résilier', 'Résiliée']) expect(actions).not.toContain(libelle)
  })

  it('Archiver et Corbeille passent par une confirmation', () => {
    expect(actions).toContain('setConfirmArchive(true)')
    expect(actions).toContain('setConfirmCorbeille(true)')
    expect(source).toContain('open={confirmArchive}')
    expect(source).toContain('open={confirmCorbeille}')
  })
})

describe('9. formulaire « Renouveler Domiciliation »', () => {
  const source = lire('modules/domiciliation/components/DomiciliationActions.jsx')
  const formulaire = source.slice(source.indexOf('export function FormulaireRenouvellement'), source.indexOf('/** Journal des actions'))

  it('élargi (xxl) et organisé en lignes lisibles', () => {
    expect(formulaire).toContain('size="xxl"')
    expect(lire('components/ui/Modal.jsx')).toContain("xxl: 'max-w-6xl'")
    expect(formulaire).toContain('lg:grid-cols-4')
  })

  it('les zones « Domiciliation », « Justificatif » et « Observation » sont supprimées du formulaire', () => {
    expect(formulaire).not.toContain('SectionRepliable')
    expect(formulaire).not.toContain('Justificatif')
    expect(formulaire).not.toContain('label="Observation"')
    expect(formulaire).not.toContain('commentaire')
    expect(formulaire).not.toContain('FileInput')
  })

  it('même présentation que la capture de référence : anciennes dates, mois, dates, règlement, signature + dates, 4 cartes documents', () => {
    const ordre = [
      'label="Ancienne Date de départ"', 'label="Ancienne Date de fin"', 'label="Mois Payés"', 'label="Mois Gratuits"',
      'label="Date de départ"', 'label="Date de fin"', '<ModePaiementChamp', 'label="Prix par mois (Dh HT)"', 'label="Prix total HT (Dh)"',
      '<ChampSignature', 'label="Date Facture"', 'label="Date Paiement"', 'label="Date Légalisation"', 'DOCUMENTS_CASES.map',
    ].map((t) => formulaire.indexOf(t))
    expect(ordre.every((p) => p > -1)).toBe(true)
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre)
    // Les cartes « Document » sont visibles d'emblée (plus rangées dans une section repliée).
    expect(formulaire).not.toContain('<SectionRepliable titre="Document" compact>')
  })

  it('le renouvellement enregistre toujours les autres informations (dates, mois, règlement, signature, documents)', () => {
    expect(formulaire).toContain('onEnregistrer({')
    for (const champ of ['date_depart', 'date_fin', 'mois_payee', 'mois_gratuits', 'prix_par_mois', 'prix_total', 'mode_paiement',
      'signature_sur_facture', 'date_facture', 'date_paiement', 'date_legalisation', 'doc_facture', 'doc_procuration']) {
      expect(formulaire, champ).toContain(champ)
    }
  })

  it('les trois pages qui ouvrent le formulaire continuent d\'appeler le renouvellement', () => {
    for (const rel of ['components/BlocsEntreprise.jsx', 'modules/domiciliation/pages/DomiciliationDetails.jsx', 'modules/domiciliation/pages/DomiciliationList.jsx']) {
      expect(lire(rel), rel).toMatch(/renouvelerDomiciliation\([^)]*champs/)
    }
  })
})

describe('10. fiches Client et Entreprise : Documents et Observations masqués par défaut', () => {
  it('la carte démarre masquée avec `ouvertParDefaut={false}` : titre et flèche seuls', () => {
    const html = rendre(createElement(CarteBloc, { icon: Folder, titre: 'Documents', ouvertParDefaut: false }, createElement('p', null, 'LIGNES')))
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label="Afficher Documents"')
    expect(html).not.toContain('LIGNES')
  })

  it('ouverte par défaut quand rien n\'est précisé (autres pages inchangées)', () => {
    const html = rendre(createElement(CarteBloc, { icon: Folder, titre: 'Documents' }, createElement('p', null, 'LIGNES')))
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('LIGNES')
  })

  it('Documents, Observations et Domiciliations sont masqués par défaut sur les deux fiches (ouvrables d\'un clic)', () => {
    const source = lire('components/BlocsEntreprise.jsx')
    expect(source.match(/ouvertParDefaut=\{false\}/g)).toHaveLength(3)
    const documents = source.slice(source.indexOf('titre="Documents"'), source.indexOf('titre="Documents"') + 120)
    const observations = source.slice(source.indexOf('titre="Observations"'), source.indexOf('titre="Observations"') + 120)
    const domiciliations = source.slice(source.indexOf('titre="Domiciliations"'), source.indexOf('titre="Domiciliations"') + 120)
    expect(documents).toContain('ouvertParDefaut={false}')
    expect(observations).toContain('ouvertParDefaut={false}')
    expect(domiciliations).toContain('ouvertParDefaut={false}')
    for (const rel of ['pages/ClientDetails.jsx', 'pages/EntrepriseDetails.jsx']) expect(lire(rel), rel).toContain('<BlocsEntreprise')
    // Fiche Domiciliation : son bloc de périodes est masqué aussi ; fiche Entreprise : plus de section « Détail de domiciliation ».
    const details = lire('modules/domiciliation/pages/DomiciliationDetails.jsx')
    expect(details.slice(details.indexOf('titre="Domiciliation"'), details.indexOf('titre="Domiciliation"') + 80)).toContain('ouvertParDefaut={false}')
    expect(lire('pages/EntrepriseDetails.jsx')).not.toContain('<Section>Détail de domiciliation</Section>')
  })

  it('fiche Domiciliation : Documents, Observations et Domiciliation masqués par défaut, bouton Renouveler à côté d\'Archive', () => {
    const details = lire('modules/domiciliation/pages/DomiciliationDetails.jsx')
    expect(details.match(/ouvertParDefaut=\{false\}/g)).toHaveLength(3)
    for (const titre of ['Documents', 'Observations', 'Domiciliation']) {
      const debut = details.indexOf(`titre="${titre}"`)
      expect(details.slice(debut, debut + 80), titre).toContain('ouvertParDefaut={false}')
    }
    expect(details).toContain('title="Renouveler cette domiciliation"')
    expect(details).toContain('setRenouvellementCible({ id, data: d })')
    // le bouton est rendu dans l'en-tête de la carte, juste avant « Archive »
    const html = rendre(createElement(CarteBloc, { icon: Folder, titre: 'Domiciliation', ouvertParDefaut: false, actions: createElement('button', { title: 'BOUTON-RENOUVELER' }), vue: 'actif', onVue: () => {} }))
    expect(html.indexOf('BOUTON-RENOUVELER')).toBeGreaterThan(-1)
    expect(html.indexOf('BOUTON-RENOUVELER')).toBeLessThan(html.indexOf('Voir les archives'))
  })
})

describe('liste des factures : action « Paiement » qui isole la facture dans la même page', () => {
  const liste = lire('modules/facturation/pages/DocumentList.jsx')

  it('l\'action « Paiement » (factures seulement) ne quitte pas la page et ne change aucune donnée ; Modifier, Archiver et Corbeille restent', () => {
    expect(liste).toContain("type === 'facture' && { label: 'Paiement', icon: <Wallet size={15} />, onClick: () => setFactureChoisie(r.id) }")
    expect(liste).not.toContain("label: 'Paiements'")
    expect(liste).not.toContain("navigate('/paiement'") // plus d'ouverture d'une autre page
    expect(liste).not.toMatch(/setFactureChoisie\([^)]*\)[^\n]*(?:createPaiement|navigate\()/) // ni formulaire de paiement automatique
    expect(liste).toContain("label: 'Modifier'")
    expect(liste).toContain("label: 'Archiver'")
    expect(liste).toContain("label: 'Corbeille'")
  })

  it('la liste est filtrée sur la facture choisie (masquage seulement) ; « Retour à la liste complète » réaffiche tout', () => {
    expect(liste).toContain('filtrees.filter((r) => r.id === factureChoisie)')
    expect(liste).toContain('Retour à la liste complète')
    expect(liste).toContain('onClick={() => setFactureChoisie(null)}')
    // Le filtre ne touche pas aux lignes chargées (`rows`) : elles restent intactes pour le retour à la liste.
    expect(liste).not.toMatch(/setRows\([^)]*filter/)
  })
})

describe('déclarations TVA : Client IF automatique, menu de téléchargement, compteur et espacement des tableaux', () => {
  const entreprises = [{ id: 1, if: 'IF-A' }, { id: 2, if: 'IF-B' }, { id: 3, if: null }]

  it('« Client IF » reprend l\'identifiant fiscal de l\'entreprise choisie, sans écraser une saisie manuelle', () => {
    expect(clientIfApresChoix(entreprises, '', 1, '')).toBe('IF-A') // champ vide : rempli
    expect(clientIfApresChoix(entreprises, 1, 2, 'IF-A')).toBe('IF-B') // changement d'entreprise : suit
    expect(clientIfApresChoix(entreprises, 1, 2, '999')).toBe('999') // saisi à la main : conservé
    expect(clientIfApresChoix(entreprises, 1, 3, 'IF-A')).toBe('') // entreprise sans IF : le champ est vidé (ancien IF automatique)
    expect(clientIfApresChoix(entreprises, 1, '', 'IF-A')).toBe('') // sélection vidée
    expect(clientIfApresChoix([], '', 1, '')).toBe('') // liste pas encore chargée
  })

  it('les formulaires TVA remplissent le champ à la sélection de l\'entreprise', () => {
    for (const rel of ['pages/DeclarationTVA.jsx', 'pages/ImportateurTvaFichier.jsx']) {
      const source = lire(rel)
      expect(source, rel).toContain('clientIfApresChoix(entreprises')
    }
    expect(lire('pages/DeclarationTVA.jsx')).toContain('onChange={choisirEntreprise}')
  })

  it('les deux listes (déclarations et chiffres d\'affaires) proposent Excel, XML et ZIP dans un menu de téléchargement', () => {
    const source = lire('pages/DeclarationTVA.jsx')
    const liste = source.slice(source.indexOf('function Liste('), source.indexOf('export function DeclarationForm'))
    expect(liste).toContain('label="Télécharger"')
    expect(liste).toContain("label: 'Excel (.xlsx)'")
    expect(liste).toContain("label: 'XML (.xml)'")
    expect(liste).toContain("label: 'ZIP (.zip)'")
    for (const format of ['xls', 'xml', 'zip']) expect(liste).toContain(`telechargerDepuisListe(r, '${format}')`)
    expect(liste).toContain('genererExport(format, donnees, type)')
    expect(liste).not.toContain('avecExportsComplets')
  })

  it('le sélecteur « Afficher N entrées » garde une largeur fixe : le nombre n\'est plus recouvert par la flèche', () => {
    const table = lire('components/ui/Table.jsx')
    expect(table).toContain('w-[5.5rem]! pl-3.5! pr-9!')
  })

  it('espacement léger sous la barre de filtres / recherche, avant le tableau', () => {
    const table = lire('components/ui/Table.jsx')
    expect(table).toContain('px-6 pt-4 pb-6 xl:grid')
  })

  it('« Domiciliations ajoutées » : tableau compact qui tient dans son cadre', () => {
    const form = lire('modules/domiciliation/pages/DomiciliationForm.jsx')
    expect(form).toContain('compact')
    const table = lire('components/ui/Table.jsx')
    expect(table).toContain("compact ? 'px-1.5' : 'px-4'")
    // En-tête standard inchangé hors mode compact.
    expect(table).toContain('text-[14px] font-medium tracking-wide uppercase whitespace-nowrap')
  })
})

describe('11. gestion de domiciliation : formulaires élargis', () => {
  it('les fenêtres Observation et Document sont en très grande largeur (comme le formulaire de domiciliation) ; Déclarer et Résilier restent en grande largeur', () => {
    const liste = lire('modules/domiciliation/pages/DomiciliationList.jsx')
    expect(liste.match(/size="xxl"/g)?.length).toBeGreaterThanOrEqual(2)
    expect(lire('modules/domiciliation/components/DomiciliationActions.jsx')).toMatch(/onClose=\{onAnnuler\}\s+size="lg"/)
    for (const rel of ['components/BlocsEntreprise.jsx', 'pages/EntreprisesList.jsx', 'modules/domiciliation/pages/DomiciliationDetails.jsx']) {
      expect(lire(rel).match(/size="xxl"/g)?.length, rel).toBe(2)
    }
  })
})

describe('7. typographie centralisée', () => {
  const css = lire('index.css')

  it('une seule échelle de tailles, la même que la page « Centres de domiciliation » (texte 15 px, titres 18 px)', () => {
    expect(css).toContain('--text-sm: 0.9375rem')
    expect(css).toContain('--text-xs: 0.8125rem')
    expect(css).toContain('--text-base: 0.9375rem')
    expect(css).toContain('--text-xl: 1.125rem')
    expect(css).toMatch(/body \{[^}]*font-size: 0\.9375rem/)
    expect(css).toMatch(/h1,\s*h2,\s*h3 \{\s*font-weight: 500/)
  })

  it('les documents officiels gardent leur typographie propre (modèles reproduits)', () => {
    expect(lire('modules/domiciliation/documents/contrat.js')).toContain("'Times New Roman'")
    expect(lire('modules/facturation/print/documentCommercial.js')).toContain("'Times New Roman'")
  })
})
