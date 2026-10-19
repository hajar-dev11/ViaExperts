// « Importateur de Déclaration » : réception de la PHOTO ou du PDF d'une déclaration TVA, contrôle du fichier et affichage.
// L'analyse (OCR) est testée à part : ocr-analyse-declaration.test.js et ocr-lecture-document.test.js.
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const permissions = { importeur: true, ajouter: true, sauvegarder_non_declare: true }
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ hasPermission: (module, action) => module === 'declaration' && Boolean(permissions[action]) }),
}))

const apiUpload = vi.fn()
vi.mock('../api/http.js', async (importOriginal) => ({ ...(await importOriginal()), apiUpload: (...args) => apiUpload(...args) }))

const { default: ImportateurTva } = await import('../pages/ImportateurTva.jsx')
const { envoyerImageDeclaration } = await import('../api/importateurTva.js')
const {
  ACCEPT_DOCUMENT_DECLARATION, LIBELLES_MOTEUR, MESSAGE_VERIFICATION, TAILLE_MAX_PDF, erreurDocumentDeclaration, estPdf, libelleEtape,
  messageErreurServeur, normaliserTypeDocument, resumerControleServeur,
} = await import('../utils/importImageTva.js')

const fichier = (nom, type, taille = 2048) => new File([new Uint8Array(taille)], nom, { type })

describe('erreurDocumentDeclaration : formats acceptés', () => {
  it.each([
    ['declaration.jpg', 'image/jpeg'],
    ['declaration.jpeg', 'image/jpeg'],
    ['scan.PNG', 'image/png'],
    ['photo.webp', 'image/webp'],
    ['declaration.pdf', 'application/pdf'],
  ])('accepte %s', (nom, type) => {
    expect(erreurDocumentDeclaration(fichier(nom, type))).toBe('')
  })

  it("accepte un document dont le navigateur n'a pas donné le type, d'après son extension (le serveur contrôle le contenu)", () => {
    expect(erreurDocumentDeclaration(fichier('photo.jpg', ''))).toBe('')
    expect(erreurDocumentDeclaration(fichier('photo.png', 'application/octet-stream'))).toBe('')
    expect(erreurDocumentDeclaration(fichier('declaration.pdf', ''))).toBe('')
  })

  it('reconnaît un PDF', () => {
    expect(estPdf(fichier('a.pdf', 'application/pdf'))).toBe(true)
    expect(estPdf(fichier('a.pdf', ''))).toBe(true)
    expect(estPdf(fichier('a.png', 'image/png'))).toBe(false)
  })
})

describe('erreurDocumentDeclaration : formats refusés, avec un message clair', () => {
  it.each([
    ['declaration.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel'],
    ['declaration.xls', 'application/vnd.ms-excel', 'Excel'],
    ['declaration.csv', 'text/csv', 'CSV'],
    ['declaration.txt', 'text/plain', 'texte'],
    ['animation.gif', 'image/gif', 'GIF'],
    ['IMG_0001.heic', 'image/heic', 'HEIC'],
    ['logo.svg', 'image/svg+xml', 'SVG'],
    ['scan.tiff', 'image/tiff', 'TIFF'],
    ['declaration.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word'],
  ])('refuse %s en nommant le format', (nom, type, format) => {
    const message = erreurDocumentDeclaration(fichier(nom, type))

    expect(message).toContain(format)
    expect(message).toContain('JPG, PNG, WebP ou PDF')
    expect(message).toContain("n'accepte que la photo ou le PDF de la déclaration")
  })

  it('refuse un type inconnu, un fichier vide, une absence de fichier et un PDF trop lourd', () => {
    expect(erreurDocumentDeclaration(fichier('declaration.bin', 'application/x-unknown'))).toContain('JPG, PNG, WebP ou PDF')
    expect(erreurDocumentDeclaration(fichier('vide.png', 'image/png', 0))).toMatch(/vide/)
    expect(erreurDocumentDeclaration(null)).toMatch(/Aucun fichier/)
    expect(erreurDocumentDeclaration(fichier('gros.pdf', 'application/pdf', TAILLE_MAX_PDF + 1))).toMatch(/trop lourd.*2 Mo maximum/)
    expect(erreurDocumentDeclaration(fichier('gros.pdf', '', TAILLE_MAX_PDF + 1))).toMatch(/trop lourd/)
  })

  it('un faux fichier déguisé par son seul nom reste accepté ici : le serveur contrôle le contenu réel', () => {
    // Le navigateur ne lit pas les octets pour annoncer le type ; c'est le serveur qui refuse un faux (ImportateurImageTvaTest.php).
    expect(erreurDocumentDeclaration(fichier('photo.jpg', 'image/jpeg'))).toBe('')
  })
})

describe('normaliserTypeDocument', () => {
  it("renseigne le type d'après l'extension quand il manque, sans toucher à un type déjà valide", () => {
    expect(normaliserTypeDocument(fichier('photo.jpg', '')).type).toBe('image/jpeg')
    expect(normaliserTypeDocument(fichier('photo.webp', '')).type).toBe('image/webp')
    expect(normaliserTypeDocument(fichier('declaration.pdf', '')).type).toBe('application/pdf')
    const valide = fichier('photo.png', 'image/png')
    expect(normaliserTypeDocument(valide)).toBe(valide)
  })

  it('ne devine rien pour une extension inconnue', () => {
    const inconnu = fichier('declaration.bin', '')
    expect(normaliserTypeDocument(inconnu)).toBe(inconnu)
  })
})

describe("envoi du document au serveur (contrôle du contenu réel)", () => {
  beforeEach(() => apiUpload.mockReset())

  it("envoie le fichier sous le champ « fichier » vers la route de l'Importateur de Déclaration", async () => {
    apiUpload.mockResolvedValue({ recue: true })
    await envoyerImageDeclaration(fichier('declaration.pdf', 'application/pdf'))

    expect(apiUpload).toHaveBeenCalledTimes(1)
    const [chemin, corps] = apiUpload.mock.calls[0]
    expect(chemin).toBe('/api/v1/importateur-tva/image')
    expect(corps).toBeInstanceOf(FormData)
    expect(corps.get('fichier').name).toBe('declaration.pdf')
  })

  it('un refus du serveur (format invalide) est présenté avec son message en français', () => {
    const refus = { message: 'The given data was invalid.', errors: { fichier: ["Ce PDF est protégé par un mot de passe : retirez la protection avant de l'importer."] } }

    expect(messageErreurServeur(refus)).toMatch(/mot de passe/)
    expect(messageErreurServeur({ message: 'Permission refusée' })).toBe('Permission refusée')
    expect(messageErreurServeur({})).toMatch(/n'a pas pu être envoyé/)
  })

  it("le résumé du contrôle serveur ne contient aucune donnée de déclaration", () => {
    const resume = resumerControleServeur({ recue: true, nom: 'd.pdf', categorie: 'pdf', type: 'application/pdf', taille: 3892, pages: 2, lignes_creees: 0 })

    expect(resume).toEqual({ nom: 'd.pdf', categorie: 'pdf', type: 'application/pdf', taille: 3892, largeur: null, hauteur: null, pages: 2, lignesCreees: 0 })
    expect(resumerControleServeur({}).lignesCreees).toBe(0)
  })
})

describe("textes d'état", () => {
  it("l'avancement est lisible et le rappel de vérification est explicite", () => {
    expect(libelleEtape({ etape: 'controle' })).toMatch(/Contrôle du fichier/)
    expect(libelleEtape({ etape: 'lecture', detail: 'page 1/2' })).toMatch(/PDF \(page 1\/2\)/)
    expect(libelleEtape({ etape: 'reconnaissance', progression: 0.456 })).toMatch(/OCR.*46 %/)
    expect(libelleEtape(null)).toBe('')
    expect(MESSAGE_VERIFICATION).toMatch(/inexactes/)
    expect(MESSAGE_VERIFICATION).toMatch(/rien n'est enregistré automatiquement/)
    expect(Object.keys(LIBELLES_MOTEUR)).toEqual(['pdf-texte', 'pdf-ocr', 'ocr'])
  })
})

describe('page « Importer Déclaration »', () => {
  const rendre = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ImportateurTva))).replaceAll('&#x27;', "'")

  beforeEach(() => { permissions.importeur = true; permissions.ajouter = true; permissions.sauvegarder_non_declare = true })

  it("propose de déposer ou sélectionner les factures, avec « Importer » désactivé tant qu'aucune photo n'est sélectionnée", () => {
    const html = rendre()

    expect(html).toContain('Importer Déclaration')
    expect(html).toContain('Déposez les factures ici ou cliquez pour les sélectionner.')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Importer(?:(?!<\/button>).)*<\/button>/s)
    expect(html).not.toContain("Résultat de l'analyse")
  })

  it("accepte photos et PDF, plusieurs fichiers à la fois, et n'annonce ni Excel, ni CSV, ni GIF", () => {
    const entree = /<input[^>]*type="file"[^>]*>/.exec(rendre())?.[0] ?? ''

    expect(entree).toContain(`accept="${ACCEPT_DOCUMENT_DECLARATION}"`)
    expect(entree).toMatch(/application\/pdf/)
    expect(entree).toMatch(/\.pdf/)
    expect(entree).not.toMatch(/xls|csv|gif/i)
    expect(entree).toContain('multiple')
  })

  it("annonce deux gestes simples (sélectionner puis « Importer »), sans long texte technique", () => {
    const html = rendre()

    expect(html).toContain('puis cliquez sur « Importer »')
    expect(html).not.toMatch(/OCR|moteur de lecture|Confiance moyenne|Nature du document|Contrôles de cohérence/)
    expect(html).not.toMatch(/n'est pas disponible dans Via Experts|ne sait pas encore lire/)
  })

  it("rien n'est lu à la sélection : l'extraction et l'ouverture du formulaire prérempli ne partent que du bouton « Importer »", async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const source = fs.readFileSync(path.resolve(import.meta.dirname, '../pages/ImportateurTva.jsx'), 'utf8')

    // La sélection ne fait que contrôler le format et afficher les vignettes.
    const ajouter = source.slice(source.indexOf('const ajouter ='), source.indexOf('const retirer ='))
    expect(ajouter).toContain('erreurDocumentDeclaration(brut)')
    expect(ajouter).not.toContain('lireDocuments')
    expect(ajouter).not.toContain('navigate(')
    expect(source).toContain('onChange={(e) => ajouter(')
    // L'extraction part du bouton.
    expect(source).toContain('onClick={importer}')
    const importer = source.slice(source.indexOf('const importer = async'), source.indexOf('if (!peutImporter)'))
    expect(importer).toContain('lireDocuments(')
    expect(importer).toContain('construireOcr(documents)')
    expect(importer).toContain("navigate('/declaration-tva/nouvelle', { state: { ocr } })")
    expect(source).not.toContain('basculer')
  })

  it("chaque photo sélectionnée s'affiche en vignette et peut être retirée avant l'import", async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const source = fs.readFileSync(path.resolve(import.meta.dirname, '../pages/ImportateurTva.jsx'), 'utf8')

    expect(source).toContain('URL.createObjectURL(fichier)')
    expect(source).toContain('aria-label="Factures sélectionnées"')
    expect(source).toContain('aria-label={`Retirer ${f.fichier.name}`}')
    expect(source).toContain('Tout retirer')
  })

  it("sans la permission « Importeur », la page refuse l'accès avec un message clair", () => {
    permissions.importeur = false
    const html = rendre()

    expect(html).toContain("Vous n'avez pas la permission")
    expect(html).not.toContain('Déposez les factures')
  })

  it("n'envoie aucun document à une adresse externe (le code de la page et de l'analyse ne contient aucune URL http)", async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    for (const f of ['../pages/ImportateurTva.jsx', '../utils/ocr/analyseDeclaration.js', '../utils/ocr/lectureDocument.js', '../utils/importImageTva.js']) {
      const source = fs.readFileSync(path.resolve(import.meta.dirname, f), 'utf8')
      expect(source, f).not.toMatch(/https?:\/\//)
    }
  })
})
