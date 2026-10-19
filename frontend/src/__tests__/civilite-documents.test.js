// Civilité (Mr / Mme) du représentant dans le contrat et l'attestation de domiciliation.
import { afterAll, describe, expect, it, vi } from 'vitest'
import { civiliteAbregee, chargerClientRepresentant } from '../modules/domiciliation/documents/civilite.js'
import { attestationParDefaut, construireHtmlAttestation } from '../modules/domiciliation/documents/attestation.js'
import { contratParDefaut, construireHtmlContrat } from '../modules/domiciliation/documents/contrat.js'

const getClient = vi.fn()
vi.mock('../api/clients.js', () => ({ getClient: (...args) => getClient(...args) }))

vi.useFakeTimers()
vi.setSystemTime(new Date('2026-10-05T10:00:00'))
afterAll(() => vi.useRealTimers())

const IDENTITE = { nomSociete: 'Via Experts', logo: 'data:image/png;base64,LOGO', signature: null, piedDePage: '', gerant: '' }
const DOMICILIATION = {
  id: 358, denomination: 'VIRKAD TECHNOLOGY', ice: '003790162000044', client: 'Samira Alaoui', clientCin: 'bh108879',
  clientAdresse: 'hay salama rue 107 casablanca', dateDepart: '2026-08-01', dateFin: '2027-08-01',
}
const ENTREPRISE = { forme: 'SARL AU', clientId: 5 }

describe('civiliteAbregee', () => {
  it('reconnaît les genres de la fiche client', () => {
    expect(civiliteAbregee('Mr')).toBe('Mr')
    expect(civiliteAbregee('Mme')).toBe('Mme')
    expect(civiliteAbregee('M.')).toBe('Mr')
    expect(civiliteAbregee(' mme ')).toBe('Mme')
    expect(civiliteAbregee('Madame')).toBe('Mme')
    expect(civiliteAbregee('Mademoiselle')).toBe('Mme')
    expect(civiliteAbregee('Monsieur')).toBe('Mr')
  })

  it('ne devine rien : absent ou inconnu → chaîne vide', () => {
    for (const v of [undefined, null, '', '   ', 'X', 'autre', 'Dr']) expect(civiliteAbregee(v), String(v)).toBe('')
  })
})

describe('attestation et contrat : civilité de la fiche client', () => {
  it('Mme sur la fiche → « Mme » (plus jamais « Mr » par défaut)', () => {
    expect(attestationParDefaut(DOMICILIATION, { entreprise: ENTREPRISE, client: { genre: 'Mme' } }).civilite).toBe('Mme')
    expect(contratParDefaut(DOMICILIATION, { entreprise: ENTREPRISE, client: { genre: 'Mme' } }).civilite).toBe('Mme')
  })

  it('Mr sur la fiche → « Mr »', () => {
    expect(attestationParDefaut(DOMICILIATION, { entreprise: ENTREPRISE, client: { genre: 'Mr' } }).civilite).toBe('Mr')
    expect(contratParDefaut(DOMICILIATION, { entreprise: ENTREPRISE, client: { genre: 'Mr' } }).civilite).toBe('Mr')
  })

  it("sans fiche client, la civilité reste vide : le prénom n'est jamais interprété", () => {
    // « Samira » est un prénom féminin : il ne doit PAS conduire à « Mme ».
    expect(attestationParDefaut(DOMICILIATION, { entreprise: ENTREPRISE }).civilite).toBe('')
    expect(contratParDefaut(DOMICILIATION, { entreprise: ENTREPRISE, client: null }).civilite).toBe('')
    expect(contratParDefaut(DOMICILIATION, { entreprise: ENTREPRISE, client: { genre: '' } }).civilite).toBe('')
  })

  it('le document généré affiche la civilité du représentant (aperçu et édition)', () => {
    const att = attestationParDefaut(DOMICILIATION, { entreprise: ENTREPRISE, client: { genre: 'Mme' } })
    for (const options of [{}, { edition: true }]) {
      const html = construireHtmlAttestation(att, IDENTITE, options).bodyHtml
      expect(html).toMatch(/Représenté par <span[^>]*data-champ="civilite"[^>]*>Mme<\/span> <span[^>]*data-champ="representant"[^>]*>SAMIRA ALAOUI<\/span>/)
    }

    const con = contratParDefaut(DOMICILIATION, { entreprise: ENTREPRISE, client: { genre: 'Mme' } })
    const htmlContrat = construireHtmlContrat(con, IDENTITE).bodyHtml
    expect(htmlContrat).toContain('Mme')
    expect(htmlContrat).toContain('SAMIRA ALAOUI')
    expect(htmlContrat).not.toContain('Mr SAMIRA')
  })

  it('le contenu fixe du domiciliataire (signataire de Via Experts) reste inchangé', () => {
    const con = contratParDefaut(DOMICILIATION, { entreprise: ENTREPRISE, client: { genre: 'Mme' } })
    expect(construireHtmlContrat(con, IDENTITE).bodyHtml).toContain('Mr MORAD BENDEQ')
    const att = attestationParDefaut(DOMICILIATION, { entreprise: ENTREPRISE, client: { genre: 'Mme' } })
    expect(construireHtmlAttestation(att, IDENTITE).bodyHtml).toContain('Mr MORAD BENDEQ')
  })
})

describe('chargerClientRepresentant', () => {
  it("lit la fiche du client rattaché à l'entreprise", async () => {
    getClient.mockResolvedValueOnce({ id: 5, genre: 'Mme' })
    expect(await chargerClientRepresentant(DOMICILIATION, ENTREPRISE)).toEqual({ client: { id: 5, genre: 'Mme' } })
    expect(getClient).toHaveBeenLastCalledWith(5)
  })

  it('renvoie client: null sans client rattaché, ou si la fiche est inaccessible (droits, réseau)', async () => {
    expect(await chargerClientRepresentant(DOMICILIATION, { forme: 'SARL' })).toEqual({ client: null })
    expect(await chargerClientRepresentant(DOMICILIATION, null)).toEqual({ client: null })
    getClient.mockRejectedValueOnce(new Error('403'))
    expect(await chargerClientRepresentant(DOMICILIATION, ENTREPRISE)).toEqual({ client: null })
  })
})
