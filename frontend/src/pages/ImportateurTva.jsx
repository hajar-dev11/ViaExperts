import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, ScanText, Trash2, Upload, X } from 'lucide-react'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import { FormActions, FormCard } from '../components/Field.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { envoyerImageDeclaration } from '../api/importateurTva.js'
import { formaterTaille, preparerImage } from '../utils/images.js'
import {
  ACCEPT_DOCUMENT_DECLARATION, erreurDocumentDeclaration, estPdf, messageErreurServeur, normaliserTypeDocument,
} from '../utils/importImageTva.js'
import { lireDocuments } from '../utils/ocr/lectureDocument.js'
import { MAX_DOCUMENTS, construireOcr } from '../utils/ocr/importFactures.js'

/**
 * « Importer Déclaration » — parcours en deux gestes :
 *   1. on SÉLECTIONNE (ou dépose) les photos / PDF des factures : elles s'affichent en vignettes, rien n'est encore lu ;
 *   2. on clique sur « Importer » : les données sont extraites dans le navigateur (aucun envoi à un service externe), puis le
 *      formulaire « Nouvelle déclaration TVA » s'ouvre PRÉREMPLI — une ligne par facture. Tout reste modifiable ; les valeurs
 *      douteuses y sont surlignées.
 * Rien n'est enregistré ici : l'enregistrement a lieu dans le formulaire, après vérification.
 *
 * Le serveur contrôle seulement le contenu réel de chaque fichier (format, taille, structure : rien n'est stocké).
 * L'import de lignes depuis un fichier Excel / CSV est un autre outil : ImportateurTvaFichier.jsx.
 */
const memeFichier = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified

export default function ImportateurTva() {
  const { hasPermission } = useAuth()
  const navigate = useNavigate()
  const peutImporter = hasPermission('declaration', 'importeur')
  const peutSaisir = hasPermission('declaration', 'ajouter') && hasPermission('declaration', 'sauvegarder_non_declare')

  const [fichiers, setFichiers] = useState([]) // [{ fichier, url, pdf }] — sélection en attente de « Importer »
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [indice, setIndice] = useState(0) // facture en cours de lecture
  const [survol, setSurvol] = useState(false)
  const champ = useRef(null)
  const verrou = useRef(false) // une seule analyse à la fois (double clic), lu de façon synchrone
  const urls = useRef([])

  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)) }, [])

  const liberer = (url) => { if (url) { URL.revokeObjectURL(url); urls.current = urls.current.filter((u) => u !== url) } }

  /** Ajoute des fichiers à la sélection : contrôle immédiat (format, taille), les refusés sont écartés avec un message. */
  const ajouter = (choisis) => {
    if (enCours || choisis.length === 0) return
    setErreur('')
    const refus = []
    const nouveaux = []
    choisis.forEach((brut) => {
      const motif = erreurDocumentDeclaration(brut)
      if (motif) { refus.push(`« ${brut.name} » : ${motif}`); return }
      const fichier = normaliserTypeDocument(brut)
      if ([...fichiers, ...nouveaux].some((x) => memeFichier(x.fichier, fichier))) return // déjà sélectionné
      const pdf = estPdf(fichier)
      const url = pdf ? null : URL.createObjectURL(fichier)
      if (url) urls.current.push(url)
      nouveaux.push({ fichier, url, pdf })
    })
    const total = [...fichiers, ...nouveaux]
    if (total.length > MAX_DOCUMENTS) {
      nouveaux.forEach((n) => liberer(n.url))
      setErreur(`Sélectionnez ${MAX_DOCUMENTS} documents au plus à la fois.`)
      return
    }
    setFichiers(total)
    if (refus.length > 0) setErreur(refus.join(' '))
    if (champ.current) champ.current.value = ''
  }

  const retirer = (i) => {
    if (enCours) return
    liberer(fichiers[i]?.url)
    setFichiers((fs) => fs.filter((_, idx) => idx !== i))
  }

  const toutRetirer = () => {
    if (enCours) return
    fichiers.forEach((f) => liberer(f.url))
    setFichiers([])
    setErreur('')
  }

  const importer = async () => {
    if (verrou.current || fichiers.length === 0) return
    verrou.current = true
    setEnCours(true)
    setErreur('')
    setIndice(0)
    try {
      const acceptes = fichiers.map((f) => f.fichier)
      // 1. Le serveur contrôle le contenu réel de chaque fichier (rien n'est stocké) ; un fichier refusé est écarté.
      const documents = []
      const lisibles = []
      for (const original of acceptes) {
        try {
          await envoyerImageDeclaration(estPdf(original) ? original : await preparerImage(original))
          lisibles.push(original)
        } catch (e) {
          documents.push({ nom: original.name, erreur: messageErreurServeur(e, 'fichier refusé.') })
        }
      }

      // 2. Lecture (texte du PDF, ou OCR pour une photo / un PDF scanné) avec un seul moteur pour tous les documents.
      const lectures = await lireDocuments(lisibles, { deuxPasses: true, onFichier: setIndice })
      lectures.forEach(({ fichier, lecture, erreur: motif }) => documents.push({ nom: fichier.name, lecture, erreur: motif }))
      documents.sort((a, b) => acceptes.findIndex((f) => f.name === a.nom) - acceptes.findIndex((f) => f.name === b.nom))

      // 3. Extraction → formulaire prérempli.
      const ocr = construireOcr(documents)
      if (ocr.lignes.length === 0) {
        setErreur(ocr.avertissements.length > 0
          ? `Aucune donnée n'a pu être extraite. ${ocr.avertissements.join(' ')}`
          : "Aucune donnée n'a pu être extraite. Essayez une photo plus nette, bien cadrée et bien éclairée, ou le PDF d'origine.")
        return
      }
      navigate('/declaration-tva/nouvelle', { state: { ocr } })
    } catch (e) {
      setErreur(messageErreurServeur(e, "L'extraction a échoué. Réessayez avec un autre fichier."))
    } finally {
      verrou.current = false
      setEnCours(false)
    }
  }

  if (!peutImporter) {
    return (
      <FormCard title="Importer Déclaration">
        <Alert tone="danger">Vous n'avez pas la permission d'utiliser l'Importateur de Déclaration (Paramètres → Assistance → Déclaration → Importeur).</Alert>
      </FormCard>
    )
  }

  const ouvrirChoix = () => { if (!enCours) champ.current?.click() }

  return (
    <div className="space-y-6">
      {erreur && (
        <Alert tone="danger" onClose={() => setErreur('')}>
          {erreur}
          {peutSaisir && <> <a className="font-semibold underline" href="#/declaration-tva/nouvelle">Saisir la déclaration manuellement</a></>}
        </Alert>
      )}

      <FormCard
        title="Importer Déclaration"
        footer={(
          <FormActions>
            {fichiers.length > 0 && (
              <Button type="button" variant="secondary" icon={<Trash2 size={16} />} onClick={toutRetirer} disabled={enCours}>
                Tout retirer
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              icon={<Upload size={16} />}
              loading={enCours}
              disabled={fichiers.length === 0 || enCours || !peutSaisir}
              title={!peutSaisir ? 'Ouvrir le formulaire demande les droits « Ajouter » et « Sauvegarder (Non Déclaré) » sur la Déclaration TVA.' : undefined}
              onClick={importer}
            >
              Importer
            </Button>
          </FormActions>
        )}
      >
        {!peutSaisir && (
          <Alert tone="warning" className="mb-4">Ouvrir le formulaire demande les droits « Ajouter » et « Sauvegarder (Non Déclaré) » sur la Déclaration TVA.</Alert>
        )}

        <div
          role="button"
          tabIndex={0}
          aria-label="Déposer les factures ici ou cliquer pour les sélectionner"
          aria-disabled={enCours}
          onClick={ouvrirChoix}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrirChoix() } }}
          onDragOver={(e) => { e.preventDefault(); if (!enCours) setSurvol(true) }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => { e.preventDefault(); setSurvol(false); ajouter([...(e.dataTransfer?.files ?? [])]) }}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 text-center transition-colors focus-ring ${
            fichiers.length > 0 ? 'min-h-[120px] py-5' : 'min-h-[260px] py-8'
          } ${enCours ? 'cursor-wait border-line bg-surface/60' : survol ? 'cursor-pointer border-brand-500 bg-brand-50' : 'cursor-pointer border-info-500 bg-surface/60 hover:bg-brand-50/50'}`}
        >
          <input
            ref={champ}
            type="file"
            multiple
            accept={ACCEPT_DOCUMENT_DECLARATION}
            className="hidden"
            aria-label="Photos ou PDF des factures"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => ajouter([...(e.target.files ?? [])])}
          />
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-ink-700 shadow-card"><Upload size={24} /></span>
          <p className={fichiers.length > 0 ? 'text-base text-ink-800' : 'text-xl text-ink-800'}>
            {fichiers.length > 0 ? 'Ajouter d’autres factures' : 'Déposez les factures ici ou cliquez pour les sélectionner.'}
          </p>
          {fichiers.length === 0 && (
            <p className="text-xs text-ink-600">Photos (JPG, PNG, WebP) ou PDF · plusieurs fichiers à la fois · puis cliquez sur « Importer »</p>
          )}
        </div>

        {fichiers.length > 0 && (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Factures sélectionnées">
            {fichiers.map((f, i) => {
              const courante = enCours && i === indice
              return (
                <li key={`${f.fichier.name}-${f.fichier.size}-${i}`} className={`relative flex items-center gap-3 rounded-lg border bg-white p-2.5 ${courante ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-line'}`}>
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-surface text-ink-600">
                    {f.pdf ? <FileText size={26} /> : <img src={f.url} alt={`Facture ${f.fichier.name}`} className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink-900" title={f.fichier.name}>{f.fichier.name}</div>
                    <div className="text-xs text-ink-600">
                      {formaterTaille(f.fichier.size)}
                      {courante && <span className="ml-2 inline-flex items-center gap-1 text-brand-600"><ScanText size={13} className="animate-pulse" /> lecture…</span>}
                    </div>
                  </div>
                  {!enCours && (
                    <button
                      type="button"
                      onClick={() => retirer(i)}
                      title={`Retirer ${f.fichier.name}`}
                      aria-label={`Retirer ${f.fichier.name}`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-600 transition-colors hover:bg-danger-50 hover:text-danger-600 focus-ring"
                    >
                      <X size={15} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {enCours && (
          <div role="status" className="mt-4 flex items-center gap-3 rounded-lg bg-surface px-4 py-3 text-sm text-ink-800">
            <ScanText size={18} className="animate-pulse text-brand-600" />
            <span>Extraction des données… facture {Math.min(indice + 1, fichiers.length)} sur {fichiers.length}</span>
          </div>
        )}
      </FormCard>
    </div>
  )
}
