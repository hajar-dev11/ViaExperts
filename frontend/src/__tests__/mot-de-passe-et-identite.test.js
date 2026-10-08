// Politique de mot de passe (miroir du serveur) et identité d'impression (route dédiée, sans droit Paramètres).
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/http.js', () => ({
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
  API_URL: 'https://api.exemple.com',
  ApiError: class ApiError extends Error {},
}))

import { apiFetch } from '../api/http.js'
import { getIdentiteDomiciliation, getIdentiteImpression } from '../api/settings.js'
import { chargerIdentite } from '../utils/print/identite.js'
import { AIDE_MOT_DE_PASSE, LONGUEUR_MINIMALE_MOT_DE_PASSE, erreurMotDePasse } from '../shared/constants/motDePasse.js'

const SRC = path.resolve(__dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('Politique des mots de passe', () => {
  it('exige 12 caractères, une lettre et un chiffre', () => {
    expect(LONGUEUR_MINIMALE_MOT_DE_PASSE).toBe(12)
    expect(AIDE_MOT_DE_PASSE).toContain('12')
    for (const faible of ['abcdefgh', 'abcdefghij1', 'abcdefghijklmn', '123456789012', 'aaaaaaaaaaaa1', '']) {
      expect(erreurMotDePasse(faible), faible).not.toBe('')
    }
    for (const bon of ['mot-de-passe-1234', 'Phrase de passe 2026', 'ÉlodieMaroc2026!']) {
      expect(erreurMotDePasse(bon), bon).toBe('')
    }
  })

  it('les formulaires de réinitialisation, de profil et de création de compte appliquent cette règle', () => {
    expect(lire('pages/ResetPassword.jsx')).toContain('erreurMotDePasse(password)')
    expect(lire('pages/ResetPassword.jsx')).not.toMatch(/password\.length < 8/)
    const parametres = lire('pages/Parametres.jsx')
    expect(parametres).not.toContain('minLength={8}')
    expect(parametres.match(/minLength=\{LONGUEUR_MINIMALE_MOT_DE_PASSE\}/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('le formulaire de profil demande le mot de passe actuel quand l\'email change', () => {
    const parametres = lire('pages/Parametres.jsx')
    expect(parametres).toContain('emailModifie')
    expect(parametres).toMatch(/\.\.\.\(emailModifie \? \{ current_password: profileCurrentPassword \} : \{\}\)/)
  })
})

describe('Identité d\'impression', () => {
  beforeEach(() => apiFetch.mockReset())

  it('appelle la route dédiée, jamais la configuration complète de Paramètres', async () => {
    apiFetch.mockResolvedValue({ nom_societe: 'Centre', logo_path: 'settings/domiciliation/l.png', signature_path: null, gerant: 'G', entreprise_info: 'Pied', afficher_entreprise_info_recu: true })

    const identite = await chargerIdentite('via_experts')
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/impression/identite/via_experts')
    expect(identite).toMatchObject({
      nomSociete: 'Centre', logo: 'https://api.exemple.com/storage/settings/domiciliation/l.png', signature: null,
      logoPath: 'settings/domiciliation/l.png', gerant: 'G', piedDePage: 'Pied', afficherPiedSurRecu: true,
    })

    apiFetch.mockClear()
    await chargerIdentite('bureau')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/impression/identite/bureau')
    await getIdentiteImpression('autre-valeur')
    expect(apiFetch).toHaveBeenLastCalledWith('/api/v1/impression/identite/bureau')
    await getIdentiteDomiciliation()
    expect(apiFetch).toHaveBeenLastCalledWith('/api/v1/impression/identite/via_experts')
  })

  it('aucun code d\'impression ni page de documents n\'appelle plus les routes réservées à Paramètres', () => {
    const fichiers = [
      'utils/print/identite.js', 'pages/ClientDetails.jsx', 'pages/EntrepriseDetails.jsx',
      'modules/domiciliation/pages/DomiciliationForm.jsx', 'modules/domiciliation/documents/documentsDomiciliation.js',
      'modules/domiciliation/documents/DocumentDomiciliationEditable.jsx', 'modules/domiciliation/print/factureDomiciliation.js',
      'modules/facturation/print/documentCommercial.js', 'modules/paiements/print/recuPaiement.js',
    ]
    for (const rel of fichiers) {
      const source = lire(rel)
      expect(source, rel).not.toMatch(/\bgetCabinetSettings\b|\bgetDomiciliationSettings\b|settings\/cabinet|settings\/domiciliation/)
    }
  })
})