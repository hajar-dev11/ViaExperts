// Formulaire « Nouvelle Declaration » : préremplissage par l'Importateur de Déclaration (OCR) et non-régression du formulaire ordinaire.
// Rendu serveur de l'état initial (sans navigateur) : les parcours interactifs (case de vérification, doublons, double clic)
// sont vérifiés dans le navigateur.
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChiffreAffairesForm, DeclarationForm } from '../pages/DeclarationTVA.jsx'
import { analyserDeclaration, signalementsFormulaire, versLignesFormulaire } from '../utils/ocr/analyseDeclaration.js'

const rendre = (Composant, state) => renderToStaticMarkup(
  createElement(MemoryRouter, { initialEntries: [{ pathname: '/declaration-tva/nouvelle', state }] }, createElement(Composant)),
).replaceAll('&#x27;', "'")

// Données telles que la page « Importer Déclaration » les transmet : issues de l'analyse réelle de l'exemple.
function donneesOcr() {
  const analyse = analyserDeclaration([
    'Déclaration de TVA – CA3 mensuelle', 'Période : octobre 2026 – Régime réel normal – Taux unique 20 %',
    '3. TVA déductible', 'Ligne Désignation Base HT TVA (20 %)',
    '19 Biens constituant des immobilisations 2 000,00 € 400,00 €',
    { texte: '20 Autres biens et services 18 000,00 € 3.600,00 €', confiance: 86 },
    '22 Report du crédit de TVA 0,00 €',
  ])
  const lignes = analyse.lignes.map((l) => ({ ...l, inclure: true })) // l'utilisateur a tout coché
  return {
    fichier: 'declaration_TVA_CA3_exemple.png', moteur: 'ocr', confianceMoyenne: 90, statut: analyse.statut,
    entete: { periode_type: analyse.entete.periode_type, periode_valeur: analyse.entete.periode_valeur, annee: analyse.entete.annee, client_if: analyse.entete.client_if },
    lignes: versLignesFormulaire(lignes), signalements: signalementsFormulaire(lignes), avertissements: analyse.avertissements, controles: analyse.controles,
  }
}

describe('formulaire prérempli par l\'OCR', () => {
  const html = rendre(DeclarationForm, { ocr: donneesOcr() })

  it('indique en une courte phrase que les données sont extraites et à vérifier (tout reste modifiable)', () => {
    expect(html).toContain('Données extraites de « declaration_TVA_CA3_exemple.png » — à vérifier.')
    expect(html).toContain('tout reste modifiable')
    expect(html).not.toContain('Elles peuvent être incomplètes ou inexactes')
  })

  it('exige une validation explicite : case « J\'ai vérifié » et boutons de sauvegarde désactivés', () => {
    expect(html).toContain("J'ai vérifié les valeurs extraites.")
    const boutons = [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*Sauvegarder \((?:Non Déclaré|Déclarée)\)(?:(?!<\/button>).)*<\/button>/gs)].map((m) => m[0])
    expect(boutons).toHaveLength(2)
    boutons.forEach((b) => expect(b).toMatch(/ disabled=""/))
  })

  it('préremplit la période et les lignes lues, et seulement elles', () => {
    expect(html).toMatch(/<option value="mois" selected/)
    expect(html).toContain('value="2026"')
    expect(html).toContain('value="Biens constituant des immobilisations"')
    expect(html).toContain('value="Autres biens et services"')
    expect(html).toContain('value="19"')
    // IF, fournisseur, numéro de facture, dates : absents du document → vides, jamais inventés.
    expect(html).not.toMatch(/value="12345678"/)
  })

  it('surligne les valeurs incertaines avec leur motif, et laisse la ligne modifiable', () => {
    expect(html).toContain('À vérifier : format inhabituel')
    expect(html).toContain('À vérifier : colonne Base HT vide ou non reconnue')
    expect(html).toContain('ring-warning-500')
  })

  it('les montants lus sont repris tels quels (le total est calculé comme dans le formulaire ordinaire)', () => {
    expect(html).toMatch(/value="2000"/)
    expect(html).toMatch(/value="3600"/)
    expect(html).toMatch(/Total HT[\s\S]*value="20000\.00"/)
  })
})

describe('non-régression : le formulaire ordinaire reste inchangé', () => {
  const html = rendre(DeclarationForm, undefined)

  it("sans données OCR : aucun bandeau, aucune case de vérification, boutons de sauvegarde actifs, table vide", () => {
    expect(html).not.toContain('Données extraites automatiquement')
    expect(html).not.toContain("J'ai vérifié")
    expect(html).toContain('Aucune ligne. Cliquez sur « Ajouter » pour commencer la saisie.')
    const boutons = [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*Sauvegarder \((?:Non Déclaré|Déclarée)\)(?:(?!<\/button>).)*<\/button>/gs)].map((m) => m[0])
    expect(boutons).toHaveLength(2)
    boutons.forEach((b) => expect(b).not.toMatch(/ disabled=""/))
  })

  it('les données OCR ne concernent pas le formulaire « Chiffre d\'Affaire »', () => {
    const ca = rendre(ChiffreAffairesForm, { ocr: donneesOcr() })
    expect(ca).not.toContain('Données extraites automatiquement')
    expect(ca).toContain('Aucune ligne.')
  })

  it('une période par défaut reste « Trimestre » et l\'année courante', () => {
    expect(html).toMatch(/<option value="trimestre" selected/)
    expect(html).toContain(`value="${new Date().getFullYear()}"`)
  })
})
