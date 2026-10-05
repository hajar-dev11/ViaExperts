import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, FileText, Pencil, RotateCcw, X } from 'lucide-react'
import Button from './ui/Button.jsx'
import Alert from './ui/Alert.jsx'
import Card, { CardHeader } from './ui/Card.jsx'
import { getDomiciliation } from '../api/domiciliations.js'
import { getEntreprise } from '../api/entreprises.js'
import { chargerIdentitePdf } from '../utils/print/identite.js'
import { htmlDocumentComplet } from '../utils/exporters.js'

// Identité de secours si les réglages sont inaccessibles (droits) : le document reste générable.
const IDENTITE_SECOURS = { nomSociete: 'Via Experts', logo: '/logo-via-experts.jpg', signature: null, piedDePage: '', gerant: '' }

const LARGEUR_PAGE = 794
const HAUTEUR_PAGE = 1123 // une feuille A4 ; un document de plusieurs pages les empile

/** Échelle qui fait tenir la page A4 dans la largeur disponible (jamais agrandie au-delà de 100 %). */
function useEchelle(ref) {
  const [echelle, setEchelle] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const mesurer = () => setEchelle(Math.min(1, (el.clientWidth - 32) / LARGEUR_PAGE))
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref])
  return echelle
}

/**
 * Page d'un document de domiciliation (attestation, contrat…) — même parcours que les factures :
 * 1. prévisualisation du document au rendu final ;
 * 2. « Modifier » ouvre une version éditable (type document) où TOUT le texte se modifie
 *    (les champs jaunes du modèle sont les données reprises automatiquement) ;
 * 3. retour à la prévisualisation du document modifié, puis « Générer le PDF ».
 * Les corrections restent en mémoire de cette page : la domiciliation et le client ne sont jamais
 * modifiés.
 *
 * @param config.titre      titre de la page
 * @param config.nom        « l'attestation », « le contrat »… (messages)
 * @param config.pages      nombre de feuilles A4 du document
 * @param config.sansSignature  true : document sans signature/cachet (la case « Signature » est ignorée)
 * @param config.charger    (facultatif) (domiciliation, entreprise) → données supplémentaires en lecture seule
 *                          (ex. fiche client), transmises à `parDefaut`
 * @param config.parDefaut  (domiciliation, { entreprise, ... }) → valeurs des champs jaunes
 * @param config.construire (valeurs, identite, { edition, contenu, signature }) → { titre, bodyHtml, css }
 * @param config.lireContenu(document de l'iframe d'édition) → contenu modifié
 * @param config.imprimer   (valeurs, identite, { contenu, signature }) → Promise (ouvre le PDF)
 */
export default function DocumentDomiciliationEditable({ config }) {
  const { titre: titrePage, nom, pages, parDefaut, construire, lireContenu, imprimer, charger, sansSignature } = config
  const navigate = useNavigate()
  const { id } = useParams()

  const [identite, setIdentite] = useState(null)
  // Signature / cachet : seulement si « Signature » est cochée sur la domiciliation ; image des réglages.
  const [signature, setSignature] = useState(null)
  const [signatureManquante, setSignatureManquante] = useState(false)
  const [defauts, setDefauts] = useState(null)
  const [valeurs, setValeurs] = useState(null)
  // Texte modifié pour CE document ({ titre, corps }) ; null = document généré automatiquement.
  const [contenu, setContenu] = useState(null)
  const baselineRef = useRef(null)
  const [edition, setEdition] = useState(false)
  const [htmlEdition, setHtmlEdition] = useState(null)
  const [erreur, setErreur] = useState('')

  const zoneRef = useRef(null)
  const iframeEditionRef = useRef(null)
  const echelle = useEchelle(zoneRef)

  useEffect(() => {
    let annule = false
    getDomiciliation(id)
      .then(async (d) => {
        const [entreprise, ident, bureau] = await Promise.all([
          getEntreprise(d.entrepriseId).catch(() => null),
          chargerIdentitePdf('via_experts').catch(() => IDENTITE_SECOURS),
          // Cachet du « Bureau de Comptabilité » (Paramètres), à défaut celui du Centre Domiciliation.
          sansSignature ? null : chargerIdentitePdf('bureau').catch(() => null),
        ])
        if (annule) return
        const cachet = !sansSignature && d.signatureSurFacture ? (bureau?.signature || ident.signature || null) : null
        setSignature(cachet)
        setSignatureManquante(!sansSignature && Boolean(d.signatureSurFacture) && !cachet)
        const extra = charger ? await charger(d, entreprise).catch(() => ({})) : {}
        if (annule) return
        const initiales = parDefaut(d, { entreprise, ...extra })
        setIdentite(ident)
        setDefauts(initiales)
        setValeurs(initiales)
      })
      .catch(() => { if (!annule) setErreur(`Impossible de charger ${nom} de cette domiciliation.`) })
    return () => { annule = true }
  }, [id, nom, parDefaut, charger, sansSignature])

  const apercu = useMemo(
    () => (identite && valeurs ? construire(valeurs, identite, { contenu, signature }) : null),
    [identite, valeurs, contenu, signature, construire],
  )

  const srcDocApercu = useMemo(
    () => (apercu ? htmlDocumentComplet(apercu.titre, apercu.bodyHtml, apercu.css) : ''),
    [apercu],
  )

  const construireEdition = useCallback((v, texte) => {
    const { titre, bodyHtml, css } = construire(v, identite, { edition: true, contenu: texte, signature })
    return htmlDocumentComplet(titre, bodyHtml, css)
  }, [identite, signature, construire])

  const ouvrirEdition = () => {
    setHtmlEdition(construireEdition(valeurs, contenu))
    setEdition(true)
  }

  // Version éditable : retours à la ligne comme dans le modèle (Entrée = saut de ligne simple),
  // collage en texte brut.
  const preparerEdition = () => {
    const doc = iframeEditionRef.current?.contentDocument
    if (!doc) return
    const inserer = (texte) => texte.split(/\r?\n/).forEach((ligne, n) => {
      if (n > 0) doc.execCommand('insertLineBreak')
      if (ligne) doc.execCommand('insertText', false, ligne)
    })
    doc.querySelectorAll('[contenteditable]').forEach((zone) => {
      zone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doc.execCommand('insertLineBreak') }
      })
      zone.addEventListener('paste', (e) => {
        e.preventDefault()
        inserer(e.clipboardData?.getData('text/plain') ?? '')
      })
    })
    baselineRef.current = JSON.stringify(lireContenu(doc))
  }

  const terminer = () => {
    const doc = iframeEditionRef.current?.contentDocument
    if (doc) {
      const lu = lireContenu(doc)
      // Aucune frappe : on garde le document tel quel (généré, ou déjà modifié).
      if (JSON.stringify(lu) !== baselineRef.current) setContenu(lu)
    }
    setEdition(false)
  }

  const annulerEdition = () => setEdition(false)

  const retablir = () => {
    setContenu(null)
    setHtmlEdition(construireEdition(defauts, null))
  }

  // `window.open` (dans `imprimer`) est appelé de façon synchrone depuis ce clic.
  const generer = () => {
    setErreur('')
    imprimer(valeurs, identite, { contenu, signature }).catch(() => setErreur(`La génération de ${nom} a échoué.`))
  }

  const pret = Boolean(apercu)
  const modifiee = contenu !== null

  return (
    <div className="space-y-4">
      <Button variant="secondary" className="w-fit" icon={<ArrowLeft size={15} />} onClick={() => navigate(-1)}>
        Retour
      </Button>

      <Card>
        <CardHeader
          title={titrePage}
          subtitle={edition
            ? 'Mode modification : cliquez dans le document pour modifier n\'importe quel texte. Le jaune indique les données reprises automatiquement.'
            : (modifiee
              ? 'Aperçu du document (corrigé pour ce PDF uniquement).'
              : "Aperçu du document tel qu'il sera généré.")}
          actions={edition ? (
            <>
              <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={retablir}>Rétablir les données d'origine</Button>
              <Button variant="secondary" icon={<X size={16} />} onClick={annulerEdition}>Annuler</Button>
              <Button variant="primary" icon={<Check size={16} />} onClick={terminer}>Terminer</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" icon={<Pencil size={16} />} onClick={ouvrirEdition} disabled={!pret}>Modifier</Button>
              <Button variant="primary" icon={<FileText size={16} />} onClick={generer} disabled={!pret}>Générer le PDF</Button>
            </>
          )}
        />
        <div className="px-6 pb-6">
          {erreur && <Alert tone="danger" className="mb-4">{erreur}</Alert>}
          {signatureManquante && (
            <Alert tone="warning" className="mb-4">
              « Signature » est cochée sur cette domiciliation, mais aucune signature/cachet n'est configurée dans
              Paramètres → Bureau de Comptabilité.
            </Alert>
          )}
          <p className="mb-3 text-xs text-ink-600">
            Les modifications sont temporaires : elles servent uniquement à ce document et ne changent jamais
            les données du client ni de la domiciliation.
          </p>

          <div ref={zoneRef} className="rounded-lg bg-slate-200/70 py-4">
            {!pret ? (
              <p className="py-20 text-center text-sm text-ink-600">{erreur ? '' : `Chargement de ${nom}…`}</p>
            ) : (
              <div
                className="relative mx-auto bg-white shadow-md"
                style={{ width: LARGEUR_PAGE * echelle, height: HAUTEUR_PAGE * pages * echelle }}
              >
                {edition ? (
                  <iframe
                    scrolling="no"
                    key="edition"
                    ref={iframeEditionRef}
                    title={`${titrePage} — modification`}
                    srcDoc={htmlEdition}
                    onLoad={preparerEdition}
                    style={{ width: LARGEUR_PAGE, height: HAUTEUR_PAGE * pages, border: 0, transform: `scale(${echelle})`, transformOrigin: 'top left' }}
                  />
                ) : (
                  <iframe
                    scrolling="no"
                    key="apercu"
                    title={`${titrePage} — aperçu`}
                    srcDoc={srcDocApercu}
                    style={{ width: LARGEUR_PAGE, height: HAUTEUR_PAGE * pages, border: 0, transform: `scale(${echelle})`, transformOrigin: 'top left' }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
