// Déclaration TVA / Chiffre d'Affaire : exports ZIP-XML-XLS réels, validation avant export, tableau classique et section repliable.
// Environnement Node : fonctions pures, rendu serveur de l'état initial, analyse du texte des pages. Les clics (flèche, boutons,
// téléchargement effectif) sont vérifiés dans le navigateur.
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChiffreAffairesForm, DeclarationForm } from '../pages/DeclarationTVA.jsx'
import SectionRepliable from '../components/ui/SectionRepliable.jsx'
import { crc32, creerZip } from '../utils/zipStockage.js'
import {
  COLONNES_EXPORT, FORMATS, construireXlsx, construireXml, dateValide, donneesDepuisApi, donneesDepuisFormulaire,
  echapperXml, genererExport, ligneVide, nomDeBase, totauxExport, validerExport,
} from '../utils/exportDeclarationTva.js'
import { critereComplet, totauxChiffreAffaire } from '../utils/chiffreAffaireTva.js'

const SRC = path.resolve(import.meta.dirname, '..')
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')
const rendre = (Composant) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Composant))).replaceAll('&#x27;', "'")
const decode = (octets) => new TextDecoder().decode(octets)

const FORM = { entreprise_id: 7, client_if: '12345678', identifiant_paiement: '1-ESPECES', periode_type: 'trimestre', periode_valeur: '3', annee: '2026', regime: '2' }
const LIGNE_VIDE = {
  ordre_ref: '', fact_num: '', designation: '', ht: 0, tva: 0, ttc: 0, identifiant_fiscal: '', libelle_fournisseur: '', ice: '',
  taux: 20, id_paie: '', date_paie: '', date_fac: '',
}
const LIGNE = {
  ...LIGNE_VIDE, ordre_ref: '1', fact_num: 'F-001/26', designation: 'Café & thé « spécial » <A>', ht: '1000', tva: '200', ttc: '1200.00',
  identifiant_fiscal: '40123456', libelle_fournisseur: 'Société L\'Atlas', ice: '001234567000089', id_paie: '1-ESPECES', date_paie: '2026-08-12', date_fac: '2026-08-10',
}
const donnees = (lignes = [LIGNE], form = FORM) => donneesDepuisFormulaire(form, lignes, 'SOCIÉTÉ Test & Fils')

/** Lecteur ZIP indépendant (annuaire central) : renvoie les entrées et vérifie leurs CRC. */
function lireZip(octets) {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  let fin = octets.length - 22
  while (fin >= 0 && vue.getUint32(fin, true) !== 0x06054b50) fin -= 1
  expect(fin).toBeGreaterThanOrEqual(0)
  const nombre = vue.getUint16(fin + 10, true)
  let position = vue.getUint32(fin + 16, true)
  const entrees = []
  for (let i = 0; i < nombre; i += 1) {
    expect(vue.getUint32(position, true)).toBe(0x02014b50)
    const crc = vue.getUint32(position + 16, true)
    const taille = vue.getUint32(position + 24, true)
    const lNom = vue.getUint16(position + 28, true)
    const decalage = vue.getUint32(position + 42, true)
    const nom = decode(octets.subarray(position + 46, position + 46 + lNom))
    // En-tête local : signature, puis données juste après le nom.
    expect(vue.getUint32(decalage, true)).toBe(0x04034b50)
    const debut = decalage + 30 + vue.getUint16(decalage + 26, true) + vue.getUint16(decalage + 28, true)
    const contenu = octets.subarray(debut, debut + taille)
    entrees.push({ nom, contenu, crcValide: crc32(contenu) === crc })
    position += 46 + lNom
  }
  return entrees
}

describe('archive ZIP : CRC-32 et structure', () => {
  it('CRC-32 conforme à la valeur de référence (« 123456789 » → CBF43926)', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('l\'archive relue par un lecteur indépendant contient les fichiers, avec des CRC valides', () => {
    const zip = creerZip([{ nom: 'a.xml', donnees: '<a>é</a>' }, { nom: 'dossier/b.txt', donnees: new Uint8Array([1, 2, 3]) }])
    const entrees = lireZip(zip)
    expect(entrees.map((e) => e.nom)).toEqual(['a.xml', 'dossier/b.txt'])
    expect(entrees.every((e) => e.crcValide)).toBe(true)
    expect(decode(entrees[0].contenu)).toBe('<a>é</a>')
  })
})

describe('validation avant export', () => {
  it('des données complètes ne bloquent rien', () => {
    expect(validerExport(donnees())).toEqual({ messages: [], champs: {} })
  })

  it('champs obligatoires absents : un message explicite par problème, rattaché au champ', () => {
    const { messages, champs } = validerExport(donnees([LIGNE], { ...FORM, entreprise_id: '', client_if: ' ', periode_valeur: '', regime: '', annee: '1999' }))
    expect(messages).toEqual([
      'Sélectionnez l’entreprise.', 'Renseignez le Client IF.', 'Sélectionnez la période.',
      'L’année doit être comprise entre 2000 et 2100.', 'Renseignez le régime.',
    ])
    expect(Object.keys(champs)).toEqual(['entreprise_id', 'client_if', 'periode_valeur', 'annee', 'regime'])
  })

  it('aucune ligne renseignée (tableau vide ou lignes vierges) : export refusé avec un message clair', () => {
    expect(validerExport(donnees([])).messages).toEqual(['Aucune ligne renseignée : ajoutez au moins une ligne avant d’exporter.'])
    expect(validerExport(donnees([LIGNE_VIDE, LIGNE_VIDE])).champs.lignes).toBeDefined()
  })

  it('ligne invalide : taux hors 0–100, montant non numérique, date inexistante — avec le numéro de ligne', () => {
    const { messages, champs } = validerExport(donnees([LIGNE, { ...LIGNE, taux: 150, ht: 'abc', date_fac: '2026-02-31', date_paie: '12/08/2026' }]))
    expect(messages).toEqual([
      'Ligne 2 : le taux doit être compris entre 0 et 100.',
      'Ligne 2 : HT n’est pas un nombre.',
      'Ligne 2 : DATE PAIE n’est pas une date valide.',
      'Ligne 2 : DATE FAC n’est pas une date valide.',
    ])
    expect(Object.keys(champs)).toEqual(['lignes.1.taux', 'lignes.1.ht', 'lignes.1.date_paie', 'lignes.1.date_fac'])
  })

  it('une ligne vierge au milieu n\'est ni exportée ni signalée ; un taux vide et des dates vides sont acceptés', () => {
    const [vide] = donnees([LIGNE_VIDE]).lignes // forme d'export (camelCase)
    expect(ligneVide(vide)).toBe(true)
    expect(ligneVide({ ...vide, factNum: 'F1' })).toBe(false)
    expect(ligneVide({ ...vide, ht: 5 })).toBe(false)
    expect(validerExport(donnees([LIGNE, LIGNE_VIDE, { ...LIGNE, taux: '', date_paie: '', date_fac: '' }])).messages).toEqual([])
  })

  it('dates réelles uniquement', () => {
    expect(dateValide('2026-02-28')).toBe(true)
    expect(dateValide('2028-02-29')).toBe(true)
    expect(dateValide('2026-02-29')).toBe(false)
    expect(dateValide('2026-13-01')).toBe(false)
    expect(dateValide('01/02/2026')).toBe(false)
  })
})

describe('XML', () => {
  const xml = construireXml(donnees([LIGNE, LIGNE_VIDE, { ...LIGNE, fact_num: 'F-002', ht: '50.5', tva: '5.05', ttc: '55.55' }]))

  it('déclaration UTF-8, racine et totaux calculés sur les lignes renseignées', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<DeclarationTVA>')).toBe(true)
    expect(xml).toContain('<TotalHT>1050.50</TotalHT>')
    expect(xml).toContain('<TotalTVA>205.05</TotalTVA>')
    expect(xml).toContain('<TotalTTC>1255.55</TotalTTC>')
    expect(xml.match(/<Ligne>/g)).toHaveLength(2) // la ligne vierge n'est pas exportée
  })

  it('TOUTES les colonnes métier sont exportées, dont LIB FRSS, ICE, ID PAIE et OR', () => {
    for (const balise of ['OrdreRef', 'NumeroFacture', 'Designation', 'HT', 'TVA', 'TTC', 'IF', 'LibelleFournisseur', 'ICE', 'Taux', 'IdPaiement', 'DateFacture', 'DatePaiement']) {
      expect(xml).toContain(`<${balise}>`)
    }
    expect(xml).toContain('<ICE>001234567000089</ICE>') // jamais en notation scientifique
  })

  it('caractères spéciaux échappés, caractères interdits retirés : le XML reste bien formé', () => {
    expect(xml).toContain('Café &amp; thé « spécial » &lt;A&gt;')
    expect(echapperXml('a&b<c>"d\'')).toBe('a&amp;b&lt;c&gt;&quot;d&apos;')
    expect(echapperXml('x\u0007y\u0000z')).toBe('xyz')
  })

  it('le chiffre d\'affaire a sa propre racine', () => {
    expect(construireXml(donnees(), 'ChiffreAffaire')).toContain('<ChiffreAffaire>')
  })
})

describe('Excel (.xlsx) et génération des fichiers', () => {
  it('classeur OOXML : les 6 parties requises, feuille avec les 13 colonnes et uniquement les lignes renseignées', () => {
    const entrees = lireZip(construireXlsx(donnees([LIGNE, LIGNE_VIDE])))
    expect(entrees.map((e) => e.nom).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
    ])
    expect(entrees.every((e) => e.crcValide)).toBe(true)
    const feuille = decode(entrees.find((e) => e.nom === 'xl/worksheets/sheet1.xml').contenu)
    expect(feuille.match(/<row /g)).toHaveLength(2) // en-tête + 1 ligne
    COLONNES_EXPORT.forEach((c) => expect(feuille).toContain(`<t>${c.entete}</t>`))
    expect(feuille).toContain('<v>1000.00</v>')
    expect(feuille).toContain('001234567000089') // ICE conservé en texte
  })

  it('chaque format produit un fichier non vide, au bon nom, au bon type', () => {
    const d = donnees()
    expect(nomDeBase(d)).toBe('declaration-tva-2026-t3-societe-test-fils')
    expect(nomDeBase(d, 'chiffre_affaire')).toBe('chiffre-affaire-2026-t3-societe-test-fils')
    for (const [format, { extension, mime }] of Object.entries(FORMATS)) {
      const f = genererExport(format, d)
      expect(f.nom).toBe(`declaration-tva-2026-t3-societe-test-fils.${extension}`)
      expect(f.mime).toBe(mime)
      expect(f.octets.length).toBeGreaterThan(100)
    }
  })

  it('le ZIP contient le XML et le classeur Excel, identiques aux exports individuels', () => {
    const d = donnees()
    const entrees = lireZip(genererExport('zip', d).octets)
    expect(entrees.map((e) => e.nom)).toEqual(['declaration-tva-2026-t3-societe-test-fils.xml', 'declaration-tva-2026-t3-societe-test-fils.xlsx'])
    expect(entrees.every((e) => e.crcValide)).toBe(true)
    expect(decode(entrees[0].contenu)).toBe(decode(genererExport('xml', d).octets))
  })

  it('format inconnu : erreur explicite (jamais un faux fichier)', () => {
    expect(() => genererExport('pdf', donnees())).toThrow(/Format d'export inconnu/)
  })

  it('les données d\'une déclaration relue sur l\'API donnent le même export que le formulaire', () => {
    const api = donneesDepuisApi({
      entrepriseId: 7, nomComplet: 'SOCIÉTÉ Test & Fils', clientIf: '12345678', identifiantPaiement: '1-ESPECES', periodeType: 'trimestre',
      periodeValeur: 3, annee: 2026, regime: '2',
      lignes: [{ ordreRef: '1', factNum: 'F-001/26', designation: LIGNE.designation, ht: '1000.00', tva: '200.00', ttc: '1200.00', identifiantFiscal: '40123456', libelleFournisseur: LIGNE.libelle_fournisseur, ice: LIGNE.ice, taux: '20.00', idPaie: '1-ESPECES', datePaie: '2026-08-12T00:00:00.000000Z', dateFac: '2026-08-10' }],
    })
    expect(validerExport(api).messages).toEqual([])
    expect(totauxExport(api)).toEqual({ ht: 1000, tva: 200, ttc: 1200 })
    expect(api.lignes[0].datePaie).toBe('2026-08-12')
  })
})

describe('page Nouvelle Declaration : tableau classique et exports', () => {
  const html = rendre(DeclarationForm)

  it('toutes les colonnes de la capture sont présentes, dans l\'ordre, y compris LIB FRSS et ICE', () => {
    const entetes = [...html.matchAll(/<th scope="col"[^>]*>\s*([A-Z ]+?)\s*<\/th>/g)].map((m) => m[1])
    expect(entetes).toEqual(['OR', 'FACT NUM', 'DESIGNATION', 'HT', 'TVA', 'TTC', 'IF', 'LIB FRSS', 'ICE', 'TAUX', 'ID PAIE', 'DATE PAIE', 'DATE FAC'])
  })

  it('tableau bordé qui tient dans la largeur de la page, SANS défilement horizontal ; montants alignés à droite', () => {
    const source = lire('pages/DeclarationTVA.jsx')
    expect(html).not.toContain('overflow-x-auto')
    expect(html).toContain('table-fixed')
    expect(html).toContain('<colgroup>')
    expect(source).not.toContain('minWidth')
    expect(source).not.toContain('LARGEUR_TABLEAU')
    expect(source).toContain('border-collapse')
    // Les parts des 13 colonnes font 100 % de la largeur.
    const parts = source.match(/const PART_COLONNE = \{([^}]*)\}/)[1].match(/\d+(?=,|\s*$|\s*\n)/g).map(Number)
    expect(parts).toHaveLength(13)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100)
    expect(source).toMatch(/droite: true/)
    expect(source).toContain("'tabular text-right'")
    expect(source).toContain('<tfoot>') // ligne de total classique
  })

  it('les trois boutons ZIP, XML et XLS sont actifs dès la saisie (plus « Disponible après l\'enregistrement »)', () => {
    for (const label of ['ZIP', 'XML', 'XLS']) expect(html).toMatch(new RegExp(`<button type="button"[^>]*>[^]*?${label}</button>`))
    expect(html).not.toContain("Disponible après l'enregistrement")
    expect(html).not.toContain('opacity-60 cursor-not-allowed') // ancien aspect « bouton désactivé »
  })

  it('le Chiffre d\'Affaire n\'a que l\'export Excel (ni ZIP ni XML)', () => {
    const ca = rendre(ChiffreAffairesForm)
    expect(ca).toContain('Exporter Excel')
    expect(ca).not.toMatch(/>\s*ZIP\s*</)
    expect(ca).not.toMatch(/>\s*XML\s*</)
  })

  it('l\'export contrôle d\'abord, génère ensuite, n\'annonce le succès qu\'après la génération et ne touche pas aux données saisies', () => {
    const source = lire('pages/DeclarationTVA.jsx')
    const exporter = source.slice(source.indexOf('const exporter = (format) => {'), source.indexOf('const boutonExport'))
    expect(exporter.indexOf('validerExport(')).toBeGreaterThan(-1)
    expect(exporter.indexOf('validerExport(')).toBeLessThan(exporter.indexOf('genererExport('))
    expect(exporter.indexOf('genererExport(')).toBeLessThan(exporter.indexOf('telecharger('))
    expect(exporter.indexOf('telecharger(')).toBeLessThan(exporter.indexOf('toast.success('))
    expect(exporter).toContain('Vos données sont conservées')
    expect(exporter).not.toContain('setForm(')
    expect(exporter).not.toContain('setLignes(')
    expect(exporter).not.toContain('navigate(')
  })

  it('le téléchargement de la liste relit la déclaration, la contrôle et ne confirme qu\'après génération', () => {
    const source = lire('pages/DeclarationTVA.jsx')
    const liste = source.slice(source.indexOf('const telechargerDepuisListe'), source.indexOf("const columns = ["))
    expect(liste.indexOf('getDeclaration(')).toBeLessThan(liste.indexOf('validerExport('))
    expect(liste.indexOf('genererExport(')).toBeLessThan(liste.indexOf('toast.success('))
    expect(source).not.toContain('urlExport')
  })
})

describe('exports : champs vides signalés par le message classique, pas par un message rouge', () => {
  const source = lire('pages/DeclarationTVA.jsx')
  const exporter = source.slice(source.indexOf('const exporter = (format)'), source.indexOf('const boutonExport'))

  it('l\'export contrôle d\'abord les champs obligatoires de l\'en-tête avec la validation native', () => {
    expect(exporter).toContain('validerChamps({ enteteSeul: true })')
    expect(exporter.indexOf('validerChamps')).toBeLessThan(exporter.indexOf('validerExport('))
    expect(source).toContain("setCustomValidity('Veuillez remplir ce champ.')")
  })

  it('le contrôle de l\'en-tête ignore les cellules du tableau des lignes', () => {
    expect(source).toContain("!el.closest('table')")
  })
})

describe('section « Chiffre d\'Affaire » repliable', () => {
  it('fermée par défaut : titre et flèche seuls, le contenu n\'est pas affiché', () => {
    const html = renderToStaticMarkup(createElement(SectionRepliable, { titre: "Chiffre d'Affaire" }, createElement('p', null, 'CONTENU SECRET')))
    expect(html).toContain("Chiffre d&#x27;Affaire")
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label="Afficher Chiffre d&#x27;Affaire"')
    expect(html).not.toContain('CONTENU SECRET')
    expect(html).not.toContain('rotate-180')
  })

  it('ouverte : le contenu est affiché et la flèche est retournée', () => {
    const html = renderToStaticMarkup(createElement(SectionRepliable, { titre: 'T', ouvertParDefaut: true }, createElement('p', null, 'CONTENU VISIBLE')))
    expect(html).toContain('CONTENU VISIBLE')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-label="Masquer T"')
    expect(html).toContain('rotate-180')
  })

  it('un clic sur la flèche bascule l\'état (ouvrir puis refermer) ; l\'action reçoit « ouvrir »', () => {
    const source = lire('components/ui/SectionRepliable.jsx')
    expect(source).toContain('onClick={() => setOuvert((o) => !o)}')
    expect(source).toContain('{ouvert && (')
    expect(source).toContain("ouvert ? 'rotate-180' : ''")
    expect(source).toContain('action({ ouvrir })')
  })

  it('page Déclaration TVA : section présente mais MASQUÉE au départ ; ses champs ne sont pas affichés', () => {
    const html = rendre(DeclarationForm)
    expect(html).toContain("Chiffre d&#x27;Affaire".replaceAll('&#x27;', "'"))
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('title="Rechercher le chiffre d\'affaire"')
    // « Total Montant TVA » : une seule occurrence (les totaux de la déclaration elle-même) ; ceux de la section sont masqués.
    expect(html.match(/Total Montant TVA/g)).toHaveLength(1)
    expect(html.match(/Total HT/g)).toHaveLength(1)
  })

  it('la section n\'existe que sur la Déclaration TVA, pas sur le formulaire Chiffre d\'Affaire', () => {
    expect(rendre(ChiffreAffairesForm)).not.toContain('Rechercher le chiffre d')
    expect(lire('pages/DeclarationTVA.jsx')).toContain("{type === 'tva' && <SectionChiffreAffaire form={form} />}")
  })
})

describe('recherche du chiffre d\'affaire', () => {
  const critere = { entrepriseId: 7, periodeType: 'trimestre', periodeValeur: '3', annee: '2026' }
  const lignes = [
    { entrepriseId: 7, periodeType: 'trimestre', periodeValeur: 3, annee: 2026, totalHt: '1000.00', totalTva: '200.00', totalTtc: '1200.00' },
    { entrepriseId: 7, periodeType: 'trimestre', periodeValeur: 3, annee: 2026, totalHt: '500.00', totalTva: '100.00', totalTtc: '600.00' },
    { entrepriseId: 8, periodeType: 'trimestre', periodeValeur: 3, annee: 2026, totalHt: '9999', totalTva: '9', totalTtc: '9' },
    { entrepriseId: 7, periodeType: 'mois', periodeValeur: 3, annee: 2026, totalHt: '7', totalTva: '7', totalTtc: '7' },
    { entrepriseId: 7, periodeType: 'trimestre', periodeValeur: 3, annee: 2025, totalHt: '8', totalTva: '8', totalTtc: '8' },
  ]

  it('additionne uniquement la même entreprise, la même période et la même année', () => {
    expect(totauxChiffreAffaire(lignes, critere)).toEqual({ ht: 1500, tva: 300, ttc: 1800, nombre: 2 })
  })

  it('aucun résultat ou réponse invalide : zéros, jamais d\'erreur', () => {
    expect(totauxChiffreAffaire([], critere)).toEqual({ ht: 0, tva: 0, ttc: 0, nombre: 0 })
    expect(totauxChiffreAffaire(null, critere).nombre).toBe(0)
  })

  it('la recherche exige l\'entreprise, la période et l\'année', () => {
    expect(critereComplet(critere)).toBe(true)
    expect(critereComplet({ ...critere, periodeValeur: '' })).toBe(false)
    expect(critereComplet({ ...critere, entrepriseId: '' })).toBe(false)
  })
})
