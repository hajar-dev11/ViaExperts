// « Importateur de TVA » — lecture des fichiers Excel / CSV dans le navigateur : formats, correspondance des colonnes,
// numérotation des lignes, limites et protections. Les .xlsx de test sont construits pour de vrai (zip + XML OOXML).
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  EN_TETES_MODELE, ErreurFichier, LIMITES, compacterEntete, decoderEntites, decoderTexte, detecterFormat, lireCsv,
  lireFichierTva, lireTableHtml, lireXlsx, mapperEntetes, modeleCsv, serieExcelEnDate,
} from '../utils/importFichierTva.js'

const octets = (texte) => strToU8(texte)
const fichier = (nom, contenu, type = '') => new File([typeof contenu === 'string' ? strToU8(contenu) : contenu], nom, { type })
const erreurDe = async (promesse) => { try { await promesse } catch (e) { return e } return null }

// ---- fabrique de classeur .xlsx --------------------------------------------------------------------------------------

/** rows : tableau de lignes ; cellule = chaîne (texte partagé), nombre, { date: serie }, { inline: texte } ou null. */
function fabriquerXlsx(rows, { feuilles = ['Feuil1'], date1904 = false, extras = {}, styles = true } = {}) {
  const partages = []
  const idx = (t) => { let i = partages.indexOf(t); if (i < 0) { i = partages.length; partages.push(t) } return i }
  const echap = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const lettre = (i) => String.fromCharCode(65 + i)

  const xmlRows = rows.map((ligne, r) => {
    const cellules = ligne.map((c, i) => {
      if (c === null || c === undefined) return ''
      const ref = `${lettre(i)}${r + 1}`
      if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`
      if (typeof c === 'object' && 'date' in c) return `<c r="${ref}" s="${c.style ?? 1}"><v>${c.date}</v></c>`
      if (typeof c === 'object' && 'inline' in c) return `<c r="${ref}" t="inlineStr"><is><t>${echap(c.inline)}</t></is></c>`
      if (typeof c === 'object' && 'formule' in c) return `<c r="${ref}"><f>${echap(c.formule)}</f><v>${c.valeur}</v></c>`
      return `<c r="${ref}" t="s"><v>${idx(String(c))}</v></c>`
    }).join('')
    return `<row r="${r + 1}">${cellules}</row>`
  }).join('')

  const fichiers = {
    '[Content_Types].xml': octets('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': octets(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${date1904 ? ' date1904="1"' : ''}/><sheets>${feuilles.map((n, i) => `<sheet name="${echap(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': octets(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((n, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
    'xl/worksheets/sheet1.xml': octets(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`),
    'xl/sharedStrings.xml': octets(`<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${partages.map((t) => `<si><t xml:space="preserve">${echap(t)}</t></si>`).join('')}</sst>`),
    ...(styles ? { 'xl/styles.xml': octets('<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>') } : {}),
    ...extras,
  }
  for (let i = 1; i < feuilles.length; i += 1) fichiers[`xl/worksheets/sheet${i + 1}.xml`] = octets('<worksheet><sheetData/></worksheet>')
  return zipSync(fichiers)
}

// ---------------------------------------------------------------------------------------------------------------------

describe('correspondance des colonnes', () => {
  it('reconnaît les 13 en-têtes du modèle (export Excel du projet)', () => {
    const { colonnes, manquants, ignorees, doublons } = mapperEntetes(EN_TETES_MODELE)
    expect(colonnes.map((c) => c.champ)).toEqual([
      'ordre_ref', 'fact_num', 'designation', 'ht', 'tva', 'ttc', 'identifiant_fiscal', 'libelle_fournisseur', 'ice', 'taux', 'id_paie', 'date_paie', 'date_fac',
    ])
    expect([manquants, ignorees, doublons]).toEqual([[], [], []])
  })

  it('ignore casse, accents, espaces et séparateurs, et reconnaît les noms de champs de la base et de l\'export XML', () => {
    const cas = {
      'fact num': 'fact_num', 'Fact_Num': 'fact_num', 'FACT-NUM': 'fact_num', ' Désignation ': 'designation', 'identifiant_fiscal': 'identifiant_fiscal',
      'libelle_fournisseur': 'libelle_fournisseur', 'Lib FRSS': 'libelle_fournisseur', 'ID_PAIE': 'id_paie', 'DatePaiement': 'date_paie',
      'DateFacture': 'date_fac', 'NumeroFacture': 'fact_num', 'date_fac': 'date_fac', 'ordre_ref': 'ordre_ref',
    }
    for (const [entete, champ] of Object.entries(cas)) expect(mapperEntetes([entete]).colonnes[0].champ, entete).toBe(champ)
    expect(compacterEntete('Désignation du bien')).toBe('DESIGNATIONDUBIEN')
  })

  it('signale les colonnes obligatoires manquantes, les colonnes inconnues et les doublons', () => {
    const m = mapperEntetes(['FACT NUM', 'Montant', 'TTC', '', 'Remarque'])
    expect(m.manquants).toEqual(['HT', 'TVA'])
    expect(m.ignorees).toEqual(['Montant', 'Remarque'])

    const d = mapperEntetes(['HT', 'TVA', 'ht'])
    expect(d.doublons).toEqual(['HT'])
    expect(d.colonnes[2].champ).toBeNull()
  })

  it('TTC est facultatif : seuls HT et TVA sont obligatoires', () => {
    expect(mapperEntetes(['HT', 'TVA']).manquants).toEqual([])
  })
})

describe('lecture CSV', () => {
  it('détecte « ; », « , » et la tabulation', () => {
    expect(lireCsv('HT;TVA\n100;20')).toEqual([['HT', 'TVA'], ['100', '20']])
    expect(lireCsv('HT,TVA\n100,20')).toEqual([['HT', 'TVA'], ['100', '20']])
    expect(lireCsv('HT\tTVA\n100\t20')).toEqual([['HT', 'TVA'], ['100', '20']])
  })

  it('gère BOM, CRLF, guillemets, séparateur et retour à la ligne dans un champ', () => {
    const csv = '﻿FACT NUM;DESIGNATION;HT\r\n"F;1";"Achat ""spécial""\nsuite";1 234,56\r\n'
    expect(lireCsv(csv)).toEqual([['FACT NUM', 'DESIGNATION', 'HT'], ['F;1', 'Achat "spécial"\nsuite', '1 234,56']])
  })

  it('refuse un guillemet non refermé', () => {
    expect(() => lireCsv('HT;TVA\n"100;20')).toThrow(/guillemet/)
  })

  it("décode l'UTF-8, et le Windows-1252 des CSV Excel français", () => {
    expect(decoderTexte(octets('Désignation'))).toBe('Désignation')
    expect(decoderTexte(Uint8Array.from([0x44, 0xe9, 0x73, 0x69, 0x67]))).toBe('Désig') // é en cp1252, invalide en UTF-8
  })
})

describe('contrôle du fichier (extension et signature)', () => {
  const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0])

  it('accepte .csv, .xlsx et l\'export .xls du projet selon le CONTENU', () => {
    expect(detecterFormat('a.csv', octets('HT;TVA\n1;2'))).toBe('csv')
    expect(detecterFormat('A.CSV', octets('HT;TVA'))).toBe('csv')
    expect(detecterFormat('a.xlsx', zip)).toBe('xlsx')
    expect(detecterFormat('a.xls', octets('<html><body><table><tr><th>HT</th></tr></table></body></html>'))).toBe('html')
  })

  it('refuse les extensions non prévues', () => {
    for (const nom of ['a.pdf', 'a.exe', 'a.php', 'a.txt', 'a.xlsm', 'a', 'a.csv.exe', 'a.html']) {
      expect(() => detecterFormat(nom, octets('HT;TVA')), nom).toThrow(/Format non pris en charge/)
    }
  })

  it("refuse un contenu qui ne correspond pas à l'extension", () => {
    expect(() => detecterFormat('a.xlsx', octets('HT;TVA\n1;2'))).toThrow(/pas un classeur Excel/)
    expect(() => detecterFormat('a.csv', zip)).toThrow(/renommez-le en .xlsx/)
    expect(() => detecterFormat('a.csv', Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toThrow(/binaire/) // exécutable Windows
  })

  it("explique l'ancien format Excel binaire (.xls)", () => {
    const biff = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])
    expect(() => detecterFormat('vieux.xls', biff)).toThrow(/ancien format Excel binaire/)
    expect(() => detecterFormat('vieux.xlsx', biff)).toThrow(/ancien format Excel binaire/)
  })

  it('refuse un .xls qui n\'est pas un export du projet, et un fichier vide', () => {
    expect(() => detecterFormat('a.xls', octets('texte quelconque'))).toThrow(/pas un export du projet/)
    expect(() => detecterFormat('a.csv', new Uint8Array(0))).toThrow(/vide/)
  })
})

describe("export Excel du projet (.xls = tableau HTML)", () => {
  // Reproduit DeclarationTvaController::versXls (htmlspecialchars sur chaque cellule).
  const html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body><table border="1"><thead><tr>'
    + EN_TETES_MODELE.map((e) => `<th>${e}</th>`).join('')
    + '</tr></thead><tbody><tr><td></td><td>F-1</td><td>Achat &amp; &quot;livraison&quot; &lt;b&gt;</td><td>1000.00</td><td>200.00</td><td>1200.00</td><td>IF1</td><td>Fournisseur d&#039;or</td><td>001</td><td>20.00</td><td></td><td>2026-03-20</td><td>2026-03-15</td></tr></tbody></table></body></html>'

  it('relit les lignes et décode les entités sans interpréter le HTML', () => {
    const lignes = lireTableHtml(html)
    expect(lignes[0]).toEqual(EN_TETES_MODELE)
    expect(lignes[1][2]).toBe('Achat & "livraison" <b>')
    expect(lignes[1][7]).toBe("Fournisseur d'or")
  })

  it('un export du projet est ré-importable de bout en bout', async () => {
    const lu = await lireFichierTva(fichier('declaration-tva-12.xls', html))
    expect(lu.format).toBe('html')
    expect(lu.lignes).toHaveLength(1)
    expect(lu.lignes[0]).toMatchObject({ ligne: 2, fact_num: 'F-1', ht: '1000.00', tva: '200.00', ttc: '1200.00', identifiant_fiscal: 'IF1', taux: '20.00', date_fac: '2026-03-15', date_paie: '2026-03-20' })
  })

  it('décode les entités numériques et refuse les caractères invalides', () => {
    expect(decoderEntites('&#65;&#x42;&amp;&lt;')).toBe('AB&<')
    expect(decoderEntites('_x0041_')).toBe('A')
    expect(decoderEntites('&#xD800;')).toBe('')
  })
})

describe('lecture .xlsx', () => {
  it('lit textes partagés, nombres, textes en ligne et formules (valeur en cache)', () => {
    const xlsx = fabriquerXlsx([
      ['FACT NUM', 'DESIGNATION', 'HT', 'TVA'],
      ['F-1', 'Achat & <test>', 1234.56, { formule: 'C2*0.2', valeur: 246.912 }],
      [{ inline: 'F-2' }, 'Service', 10, 2],
    ])
    const { lignes, feuille, nbFeuilles } = lireXlsx(xlsx)
    expect(feuille).toBe('Feuil1')
    expect(nbFeuilles).toBe(1)
    expect(lignes[0]).toEqual(['FACT NUM', 'DESIGNATION', 'HT', 'TVA'])
    expect(lignes[1]).toEqual(['F-1', 'Achat & <test>', '1234.56', '246.912'])
    expect(lignes[2]).toEqual(['F-2', 'Service', '10', '2'])
  })

  it('convertit les cellules de date (format intégré 14 et format personnalisé jj/mm/aaaa)', () => {
    // 46096 = 15/03/2026 ; 46101 = 20/03/2026
    const { lignes } = lireXlsx(fabriquerXlsx([['DATE FAC', 'DATE PAIE'], [{ date: 46096, style: 1 }, { date: 46101, style: 2 }]]))
    expect(lignes[1]).toEqual(['2026-03-15', '2026-03-20'])
  })

  it('un nombre qui n\'est PAS au format date reste un nombre', () => {
    const { lignes } = lireXlsx(fabriquerXlsx([['HT'], [46095]]))
    expect(lignes[1]).toEqual(['46095'])
  })

  it('sait convertir les numéros de série (systèmes 1900 et 1904)', () => {
    expect(serieExcelEnDate(46096)).toBe('2026-03-15')
    expect(serieExcelEnDate(44634, true)).toBe('2026-03-15') // même date dans le système 1904
    expect(serieExcelEnDate(46096.75)).toBe('2026-03-15') // l'heure est ignorée
    expect(serieExcelEnDate(61)).toBe('1900-03-01')
    for (const invalide of [0, -3, 'abc', 99999999]) expect(serieExcelEnDate(invalide)).toBeNull()
  })

  it('conserve la numérotation Excel des lignes vides et les cellules vides', () => {
    const xlsx = fabriquerXlsx([['HT', 'TVA'], [], [100, null], [null, 5]])
    const { lignes } = lireXlsx(xlsx)
    expect(lignes[1]).toEqual([])
    expect(lignes[2]).toEqual(['100'])
    expect(lignes[3]).toEqual(['', '5'])
  })

  it('ne lit que la première feuille et le signale', async () => {
    const f = fichier('deux.xlsx', fabriquerXlsx([['HT', 'TVA'], [1, 2]], { feuilles: ['Achats', 'Ventes'] }))
    const lu = await lireFichierTva(f)
    expect(lu.feuille).toBe('Achats')
    expect(lu.avertissements.join(' ')).toMatch(/2 feuilles.*seule la première/)
  })

  it('classeur sans styles : les nombres restent des nombres', () => {
    expect(lireXlsx(fabriquerXlsx([['HT'], [12.5]], { styles: false })).lignes[1]).toEqual(['12.5'])
  })

  it('refuse un classeur qui déclare une DTD / des entités XML', () => {
    const piege = fabriquerXlsx([['HT'], [1]], { extras: { 'xl/sharedStrings.xml': octets('<?xml version="1.0"?><!DOCTYPE sst [<!ENTITY a "aaaa">]><sst><si><t>&a;</t></si></sst>') } })
    expect(() => lireXlsx(piege)).toThrow(/déclaration XML non autorisée/)
  })

  it("refuse une « bombe zip » (fichier interne démesuré une fois décompressé)", () => {
    const enorme = new Uint8Array(LIMITES.tailleEntreeMax + 1024) // se compresse en quelques Ko
    const bombe = fabriquerXlsx([['HT'], [1]], { extras: { 'xl/worksheets/sheet1.xml': enorme } })
    expect(bombe.length).toBeLessThan(200 * 1024)
    expect(() => lireXlsx(bombe)).toThrow(/trop volumineux une fois décompressé/)
  })

  it('refuse un classeur avec un nombre excessif de fichiers internes', () => {
    const extras = Object.fromEntries(Array.from({ length: LIMITES.entreesZipMax + 5 }, (_, i) => [`xl/media/i${i}.xml`, octets('<a/>')]))
    expect(() => lireXlsx(fabriquerXlsx([['HT'], [1]], { extras }))).toThrow(/trop de fichiers internes/)
  })

  it('refuse un numéro de ligne démesuré (pas d\'allocation de millions de lignes)', () => {
    const sheet = '<worksheet><sheetData><row r="900000000"><c r="A900000000"><v>1</v></c></row></sheetData></worksheet>'
    expect(() => lireXlsx(fabriquerXlsx([['HT']], { extras: { 'xl/worksheets/sheet1.xml': octets(sheet) } }))).toThrow(/beaucoup trop de lignes/)
  })

  it('un zip corrompu ou qui n\'est pas un classeur donne un message clair', () => {
    expect(() => lireXlsx(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]))).toThrow(ErreurFichier)
    expect(() => lireXlsx(zipSync({ 'readme.txt': octets('bonjour') }))).toThrow(/pas un classeur Excel valide/)
  })
})

describe('lireFichierTva (de bout en bout)', () => {
  const entete = 'OR;FACT NUM;DESIGNATION;HT;TVA;TTC;IF;LIB FRSS;ICE;TAUX;ID PAIE;DATE PAIE;DATE FAC'

  it('lit un CSV valide et numérote comme le fichier (en-tête = ligne 1)', async () => {
    const csv = `${entete}\n1;F-1;Achat;1000;200;1200;IF1;Fournisseur;001;20;ESPECES;20/03/2026;15/03/2026\n\n2;F-2;Service;500;100;;IF2;;;;;;`
    const lu = await lireFichierTva(fichier('achats.csv', csv))

    expect(lu.format).toBe('csv')
    expect(lu.lignes.map((l) => l.ligne)).toEqual([2, 4]) // la ligne 3 est vide : ignorée, numérotation conservée
    expect(lu.videsIgnorees).toBe(1)
    expect(lu.lignes[0]).toMatchObject({ ordre_ref: '1', fact_num: 'F-1', ht: '1000', ttc: '1200', identifiant_fiscal: 'IF1', date_fac: '15/03/2026' })
    expect(lu.lignes[1]).toMatchObject({ fact_num: 'F-2', ttc: '', taux: '' })
  })

  it('accepte un fichier réduit à HT et TVA, et signale les colonnes inconnues', async () => {
    const lu = await lireFichierTva(fichier('mini.csv', 'HT;TVA;Commentaire\n100;20;ok'))
    expect(lu.lignes[0]).toEqual({ ligne: 2, ht: '100', tva: '20' })
    expect(lu.avertissements.join(' ')).toContain('Commentaire')
  })

  it('refuse un fichier sans colonne HT/TVA en listant ce qui a été trouvé', async () => {
    const e = await erreurDe(lireFichierTva(fichier('x.csv', 'Libellé;Montant\nA;10')))
    expect(e).toBeInstanceOf(ErreurFichier)
    expect(e.message).toContain('HT, TVA')
    expect(e.message).toContain('Libellé, Montant')
  })

  it('refuse les colonnes en double, un fichier sans données et un fichier vide', async () => {
    expect((await erreurDe(lireFichierTva(fichier('d.csv', 'HT;TVA;HT\n1;2;3')))).message).toMatch(/en double.*HT/)
    expect((await erreurDe(lireFichierTva(fichier('e.csv', 'HT;TVA\n')))).message).toMatch(/aucune ligne de données/)
    expect((await erreurDe(lireFichierTva(fichier('v.csv', '\n\n')))).message).toMatch(/aucune donnée/)
    expect((await erreurDe(lireFichierTva(fichier('z.csv', '')))).message).toMatch(/vide/)
  })

  it('refuse un fichier trop volumineux AVANT de le lire', async () => {
    const gros = { name: 'gros.csv', size: LIMITES.tailleMax + 1, arrayBuffer: () => { throw new Error('ne doit pas être lu') } }
    const e = await erreurDe(lireFichierTva(gros))
    expect(e.message).toMatch(/trop volumineux.*2 Mo maximum/)
  })

  it('refuse plus de 1000 lignes de données', async () => {
    const lignes = Array.from({ length: LIMITES.lignesMax + 1 }, (_, i) => `${i};1`).join('\n')
    const e = await erreurDe(lireFichierTva(fichier('mille.csv', `HT;TVA\n${lignes}`)))
    expect(e.message).toMatch(/plus de 1000 lignes/)
    expect((await lireFichierTva(fichier('ok.csv', `HT;TVA\n${Array.from({ length: LIMITES.lignesMax }, () => '1;1').join('\n')}`))).lignes).toHaveLength(LIMITES.lignesMax)
  })

  it('refuse un type de fichier dangereux ou déguisé', async () => {
    for (const nom of ['virus.exe', 'page.html', 'script.php', 'macro.xlsm']) {
      expect((await erreurDe(lireFichierTva(fichier(nom, 'HT;TVA\n1;2')))).message, nom).toMatch(/Format non pris en charge/)
    }
    const deguise = await erreurDe(lireFichierTva(fichier('facture.csv', Uint8Array.from([0x4d, 0x5a, 0x00, 0x00, 0x10]))))
    expect(deguise.message).toMatch(/binaire/)
  })

  it('les valeurs dangereuses restent du texte inerte (jamais interprétées)', async () => {
    const lu = await lireFichierTva(fichier('h.csv', 'FACT NUM;DESIGNATION;HT;TVA\n=CMD|\'/c calc\'!A0;<img src=x onerror=alert(1)>;1;2'))
    expect(lu.lignes[0].fact_num).toBe("=CMD|'/c calc'!A0")
    expect(lu.lignes[0].designation).toBe('<img src=x onerror=alert(1)>')
  })

  it('lit un .xlsx complet avec dates et nombres', async () => {
    const xlsx = fabriquerXlsx([
      EN_TETES_MODELE,
      [null, 'F-1', 'Achat', 1000, 200, 1200, 'IF1', null, null, 20, null, { date: 46101, style: 1 }, { date: 46096, style: 1 }],
    ])
    const lu = await lireFichierTva(fichier('achats.xlsx', xlsx))
    expect(lu.format).toBe('xlsx')
    expect(lu.lignes[0]).toMatchObject({ ligne: 2, fact_num: 'F-1', ht: '1000', tva: '200', ttc: '1200', taux: '20', date_paie: '2026-03-20', date_fac: '2026-03-15' })
  })
})

describe('modèle téléchargeable', () => {
  it("contient uniquement les 13 en-têtes (aucune donnée fictive), en UTF-8 avec BOM", () => {
    const m = modeleCsv()
    expect(m.charCodeAt(0)).toBe(0xfeff)
    expect(m.slice(1).trimEnd()).toBe(EN_TETES_MODELE.join(';'))
    expect(m.trim().split(/\r?\n/)).toHaveLength(1)
    expect(lireCsv(m)[0]).toEqual(EN_TETES_MODELE)
  })
})
