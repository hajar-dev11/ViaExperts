import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Plus, Save, Trash2, Download, Archive, RotateCcw, ArrowLeft, X, FileCode2, FileSpreadsheet, FileArchive, Search } from 'lucide-react'
import { IconeActions, IconeModifier } from '../components/ui/icons.jsx'
import DataTable from '../components/DataTable.jsx'
import ExportMenu from '../components/ExportMenu.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ActionMenu from '../components/ui/ActionMenu.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button, { IconButton } from '../components/ui/Button.jsx'
import SectionRepliable from '../components/ui/SectionRepliable.jsx'
import { CelluleInput } from '../components/ui/LigneSaisie.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { Checkbox, Field, Input, Select, FormCard, FormActions } from '../components/Field.jsx'
import SelectRecherche from '../components/SelectRecherche.jsx'
import { clientIfApresChoix, optionsEntreprises } from '../utils/rechercheOptions.js'
import { ApiError } from '../api/http.js'
import { listEntreprises } from '../api/entreprises.js'
import {
  listDeclarations, getDeclaration, createDeclaration, updateDeclaration, facturesExistantes, especesExistantes,
  archiveDeclaration, corbeilleDeclaration, restoreDeclaration, deleteDeclarationForever,
} from '../api/declarationsTva.js'
import { donneesDepuisApi, donneesDepuisFormulaire, genererExport, telecharger, validerExport } from '../utils/exportDeclarationTva.js'
import { critereComplet, totauxChiffreAffaire } from '../utils/chiffreAffaireTva.js'
import { tvaDepuisHt } from '../utils/calculTva.js'
import { IDENTIFIANT_PAIEMENT_PAR_DEFAUT, optionsIdentifiantPaiement } from '../utils/identifiantsPaiement.js'
import { analyserDoublons, analyserEspeces, fondDeCellule, normaliserNumero } from '../utils/controlesFactures.js'

const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`
const n = (v) => { const x = parseFloat(v); return Number.isNaN(x) ? 0 : x }

function SituationBadge({ situation }) {
  const declaree = situation === 'declaree'
  return (
    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${declaree ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
      {declaree ? 'Déclarée' : 'Non Déclaré'}
    </span>
  )
}

const emptyLigne = {
  ordre_ref: '', fact_num: '', designation: '', ht: 0, tva: 0, ttc: 0,
  identifiant_fiscal: '', libelle_fournisseur: '', ice: '', taux: 20,
  id_paie: '', date_paie: '', date_fac: '',
}

// Colonnes du tableau de saisie : TOUTES celles de la capture de référence (« Nouvelle Chiffre d'Affaire », même tableau pour
// « Nouvelle Déclaration »), y compris LIB FRSS et ICE. `largeur` (px) est une largeur MINIMALE : le tableau défile
// horizontalement plutôt que de couper une valeur. Les montants et le taux sont alignés à droite, chiffres tabulaires.
// IF est aussi la clé qui identifie « le même fournisseur/client » pour le contrôle du seuil espèces (règle ci-dessous).
const COLONNES_LIGNE = [
  { cle: 'ordre_ref', label: 'OR', largeur: 64, centre: true },
  { cle: 'fact_num', label: 'FACT NUM', largeur: 130 },
  { cle: 'designation', label: 'DESIGNATION', largeur: 220 },
  { cle: 'ht', label: 'HT', type: 'number', largeur: 120, droite: true },
  { cle: 'tva', label: 'TVA', type: 'number', largeur: 110, droite: true },
  { cle: 'ttc', label: 'TTC', type: 'number', largeur: 120, droite: true },
  { cle: 'identifiant_fiscal', label: 'IF', largeur: 120 },
  { cle: 'libelle_fournisseur', label: 'LIB FRSS', largeur: 190 },
  { cle: 'ice', label: 'ICE', largeur: 170 },
  { cle: 'taux', label: 'TAUX', type: 'number', largeur: 80, droite: true },
  { cle: 'id_paie', label: 'ID PAIE', largeur: 100 },
  { cle: 'date_paie', label: 'DATE PAIE', type: 'date', largeur: 150 },
  { cle: 'date_fac', label: 'DATE FAC', type: 'date', largeur: 150 },
]
// Le tableau tient TOUJOURS dans la largeur de la page (aucun défilement horizontal) : chaque colonne reçoit une part de la largeur
// (en %, total 100), la colonne de suppression une largeur fixe. Les intitulés passent à la ligne, les dates sont un peu plus petites.
const PART_COLONNE = {
  ordre_ref: 3, fact_num: 7, designation: 10, ht: 7, tva: 6, ttc: 7, identifiant_fiscal: 7, libelle_fournisseur: 10, ice: 10, taux: 6,
  id_paie: 7, date_paie: 10, date_fac: 10,
}

// Contrôles visuels (doublons de numéro de facture, espèces > 5 000 Dh) : voir utils/controlesFactures.js, communs à la Déclaration TVA
// et au Chiffre d'Affaire. Simples avertissements : ils ne bloquent jamais l'enregistrement.

// ------------------------------------------------------- Chiffre d'Affaire (repliable)

/**
 * Section « Chiffre d'Affaire » de la page Déclaration TVA : MASQUÉE par défaut (titre + flèche), elle s'ouvre au clic sur la
 * flèche. Le bouton de recherche (orange) cherche les chiffres d'affaire déjà enregistrés pour l'entreprise, la période et
 * l'année choisies ci-dessous et en affiche les totaux ; lecture seule, rien n'est enregistré ni modifié.
 */
function SectionChiffreAffaire({ form }) {
  const [totaux, setTotaux] = useState({ ht: 0, tva: 0, ttc: 0, nombre: null })
  const [chargement, setChargement] = useState(false)
  const [message, setMessage] = useState('')

  const rechercher = async (ouvrir) => {
    ouvrir()
    const critere = { entrepriseId: form.entreprise_id, periodeType: form.periode_type, periodeValeur: form.periode_valeur, annee: form.annee }
    if (!critereComplet(critere)) {
      setMessage('Sélectionnez l’entreprise, la période et l’année pour rechercher le chiffre d’affaire.')
      return
    }
    setChargement(true); setMessage('')
    try {
      const lignes = await listDeclarations('chiffre_affaire', { status: 'actif' })
      setTotaux(totauxChiffreAffaire(lignes, critere))
    } catch (err) {
      setMessage(err instanceof ApiError && err.status === 403
        ? 'Vous n’avez pas la permission de consulter le chiffre d’affaire.'
        : 'La recherche du chiffre d’affaire a échoué. Réessayez.')
    } finally {
      setChargement(false)
    }
  }

  return (
    <SectionRepliable
      titre="Chiffre d'Affaire"
      className="mb-4"
      action={({ ouvrir }) => (
        <IconButton variant="warning" title="Rechercher le chiffre d'affaire" aria-label="Rechercher le chiffre d'affaire" loading={chargement} onClick={() => rechercher(ouvrir)}>
          <Search size={18} />
        </IconButton>
      )}
    >
      {message && <Alert tone="warning" className="mb-4" onClose={() => setMessage('')}>{message}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Total HT"><Input readOnly value={totaux.ht.toFixed(2)} className="tabular bg-slate-100 text-right" /></Field>
        <Field label="Total Montant TVA"><Input readOnly value={totaux.tva.toFixed(2)} className="tabular bg-slate-100 text-right" /></Field>
        <Field label="Total TTC"><Input readOnly value={totaux.ttc.toFixed(2)} className="tabular bg-slate-100 text-right" /></Field>
      </div>
      {totaux.nombre !== null && !message && (
        <p className="mt-3 text-[13px] text-ink-600">
          {totaux.nombre === 0
            ? 'Aucun chiffre d’affaire enregistré pour cette entreprise et cette période.'
            : `${totaux.nombre} chiffre(s) d’affaire enregistré(s) pour cette entreprise et cette période.`}
        </p>
      )}
    </SectionRepliable>
  )
}

// ------------------------------------------------------------------ Formulaire

function Formulaire({ type, titre, listTo, avecExportsComplets }) {
  const navigate = useNavigate()
  const toast = useToast()
  const location = useLocation()
  const { id } = useParams()
  const isEdit = !!id

  // Données lues par l'« Importateur de Déclaration » (OCR) : uniquement pour une NOUVELLE déclaration TVA. Elles ne font que
  // PRÉREMPLIR le formulaire (tout reste modifiable) ; rien n'est enregistré sans validation explicite (case « J'ai vérifié »).
  const ocr = !isEdit && type === 'tva' ? (location.state?.ocr ?? null) : null
  const [verifie, setVerifie] = useState(false)
  const [doublon, setDoublon] = useState(null)
  const verrou = useRef(false) // une seule sauvegarde à la fois (double clic), lu de façon synchrone
  const formRef = useRef(null) // formulaire natif : sert à la validation « Veuillez remplir ce champ. »

  const [form, setForm] = useState(() => ({
    entreprise_id: '', client_if: ocr?.entete?.client_if ?? '', identifiant_paiement: IDENTIFIANT_PAIEMENT_PAR_DEFAUT,
    periode_type: ocr?.entete?.periode_type ?? 'trimestre', periode_valeur: ocr?.entete?.periode_valeur ? String(ocr.entete.periode_valeur) : '',
    annee: ocr?.entete?.annee ? String(ocr.entete.annee) : String(new Date().getFullYear()), regime: '2',
  }))
  // Table vide au départ : seuls les titres de colonnes sont visibles tant que
  // l'utilisateur n'a pas cliqué sur « Ajouter » (le cas édition repeuple ce
  // state depuis les lignes existantes, ci-dessous). Avec des données OCR, les
  // lignes lues sont déjà là ; `_ocr` garde les alertes de chaque ligne (retirées
  // dès que l'utilisateur modifie la valeur concernée, jamais envoyées au serveur).
  const [lignes, setLignes] = useState(() => (ocr?.lignes ?? []).map((l, i) => ({
    ...emptyLigne, ...l,
    _client: ocr.clients?.[i] ?? null, // destinataire de la facture (voir « Utiliser le client » plus bas) : jamais envoyé au serveur
    _ocr: Object.fromEntries(Object.entries(ocr.signalements ?? {}).filter(([cle]) => cle.startsWith(`${i}.`)).map(([cle, motif]) => [cle.slice(cle.indexOf('.') + 1), motif])),
  })))
  const [entreprises, setEntreprises] = useState([])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [erreursExport, setErreursExport] = useState([])
  const [erreurChargement, setErreurChargement] = useState('')
  const [saving, setSaving] = useState(false)

  // Une erreur disparaît dès que son champ est corrigé.
  const effacerErreur = (cle) => setErrors((e) => {
    if (!e[cle]) return e
    const { [cle]: _retiree, ...reste } = e
    return reste
  })
  const set = (k) => (e) => { effacerErreur(k); setForm((f) => ({ ...f, [k]: e.target.value })) }
  // Le « Client IF » se remplit tout seul avec l'identifiant fiscal de l'entreprise choisie (jamais par-dessus une saisie manuelle).
  const choisirEntreprise = (valeur) => {
    effacerErreur('entreprise_id'); effacerErreur('client_if')
    setForm((f) => ({ ...f, entreprise_id: valeur, client_if: clientIfApresChoix(entreprises, f.entreprise_id, valeur, f.client_if) }))
  }

  useEffect(() => {
    listEntreprises('actif').then(setEntreprises).catch(() => setEntreprises([]))
  }, [])

  const charger = useCallback(() => {
    if (!isEdit) return
    getDeclaration(type, id)
      .then((d) => {
        setErreurChargement('')
        setForm({
          entreprise_id: d.entrepriseId ?? '',
          client_if: d.clientIf ?? '',
          identifiant_paiement: d.identifiantPaiement ?? '',
          periode_type: d.periodeType ?? 'trimestre',
          periode_valeur: d.periodeValeur ?? '',
          annee: String(d.annee ?? ''),
          regime: d.regime ?? '',
        })
        setLignes((d.lignes || []).map((l) => ({
          ordre_ref: l.ordreRef ?? '', fact_num: l.factNum ?? '', designation: l.designation ?? '',
          ht: l.ht, tva: l.tva, ttc: l.ttc,
          identifiant_fiscal: l.identifiantFiscal ?? '', libelle_fournisseur: l.libelleFournisseur ?? '',
          ice: l.ice ?? '', taux: l.taux, id_paie: l.idPaie ?? '',
          date_paie: l.datePaie ?? '', date_fac: l.dateFac ?? '',
        })))
      })
      .catch(() => setErreurChargement('Déclaration introuvable.'))
  }, [id, isEdit, type])

  useEffect(() => { charger() }, [charger])

  const totaux = useMemo(() => ({
    ht: lignes.reduce((a, l) => a + n(l.ht), 0),
    tva: lignes.reduce((a, l) => a + n(l.tva), 0),
    ttc: lignes.reduce((a, l) => a + n(l.ttc), 0),
  }), [lignes])

  // Cumul des espèces par tiers (client pour le Chiffre d'Affaire, fournisseur pour la Déclaration TVA) : le tableau ET les
  // règlements en espèces déjà enregistrés pour cette entreprise, ce type de déclaration et cette année. Lecture seule : sans
  // effet sur l'enregistrement ; une erreur de réseau retire seulement la part « déjà enregistrée » du cumul.
  const [especesEnregistrees, setEspecesEnregistrees] = useState([])
  useEffect(() => {
    const anneeValide = Number(form.annee) >= 2000 && Number(form.annee) <= 2100
    if (!form.entreprise_id || !anneeValide) { setEspecesEnregistrees([]); return undefined }
    let actif = true
    especesExistantes(type, { entrepriseId: form.entreprise_id, annee: form.annee, exclure: isEdit ? id : null })
      .then((r) => { if (actif) setEspecesEnregistrees(Array.isArray(r) ? r : []) })
      .catch(() => { if (actif) setEspecesEnregistrees([]) })
    return () => { actif = false }
  }, [type, form.entreprise_id, form.annee, isEdit, id])
  const analyseEspeces = useMemo(
    () => analyserEspeces(lignes, form.identifiant_paiement, especesEnregistrees),
    [lignes, form.identifiant_paiement, especesEnregistrees],
  )

  // Doublons de numéro de facture (même fournisseur) : dans le tableau, ET parmi les factures déjà enregistrées pour cette
  // entreprise. Le contrôle des factures enregistrées est relancé quand les numéros ou l'entreprise changent ; il est en lecture
  // seule et sans effet sur l'enregistrement (une erreur de réseau ne fait que retirer l'avertissement).
  const [existantes, setExistantes] = useState([])
  // Les numéros saisis sont résumés en une chaîne : modifier une autre cellule ne relance pas la vérification.
  const cleNumeros = [...new Set(lignes.map((l) => normaliserNumero(l.fact_num)).filter(Boolean))].sort().join('\u0001')
  useEffect(() => {
    if (!form.entreprise_id || !cleNumeros) { setExistantes([]); return undefined }
    let actif = true
    const minuteur = setTimeout(() => {
      facturesExistantes(type, { entrepriseId: form.entreprise_id, numeros: cleNumeros.split('\u0001'), exclure: isEdit ? id : null })
        .then((r) => { if (actif) setExistantes(Array.isArray(r) ? r : []) })
        .catch(() => { if (actif) setExistantes([]) })
    }, 400)
    return () => { actif = false; clearTimeout(minuteur) }
  }, [type, form.entreprise_id, cleNumeros, isEdit, id])
  const doublons = useMemo(() => analyserDoublons(lignes, existantes), [lignes, existantes])

  const majLigne = (i, k, v) => {
    effacerErreur(`lignes.${i}.${k}`)
    setLignes((ls) => ls.map((l, idx) => {
    if (idx !== i) return l
    let val = v
    // Le taux ne doit jamais dépasser 100 (ni être négatif) — clampé au fil
    // de la saisie, en miroir de la règle backend `max:100`/`min:0`.
    if (k === 'taux' && val !== '') {
      const num = Number(val)
      if (Number.isFinite(num)) {
        if (num > 100) val = '100'
        else if (num < 0) val = '0'
      }
    }
    const maj = { ...l, [k]: val }
    if (maj._ocr?.[k]) maj._ocr = Object.fromEntries(Object.entries(maj._ocr).filter(([champ]) => champ !== k))
    // Saisie réduite au HT : TVA = HT × taux, puis TTC = HT + TVA, recalculés dès que le HT ou le taux change. La TVA reste
    // modifiable à la main (le TTC suit alors) ; elle n'est réécrite que par un nouveau HT ou un nouveau taux.
    if (k === 'ht' || k === 'taux') maj.tva = tvaDepuisHt(maj.ht, maj.taux)
    if (k === 'ht' || k === 'taux' || k === 'tva') maj.ttc = (n(maj.ht) + n(maj.tva)).toFixed(2)
    return maj
    }))
  }

  // Miroir des règles backend (DeclarationTvaController::regles) côté
  // frontend : évite un aller-retour 422 pour une erreur détectable ici.
  const validerLignes = () => {
    const errs = {}
    if (lignes.length === 0) {
      errs.lignes = ['Ajoutez au moins une ligne avant d’enregistrer.']
      return errs
    }
    lignes.forEach((l, i) => {
      // Montant ou taux non lu dans le document (cellule vide) : signalé par le message classique « Veuillez remplir ce champ »
      // (champ `required`, voir `validerChamps`), pas par un message rouge.
      const taux = l.taux === '' ? null : Number(l.taux)
      if (taux !== null && (Number.isNaN(taux) || taux < 0 || taux > 100)) {
        errs[`lignes.${i}.taux`] = ['Le taux doit être compris entre 0 et 100.']
      }
    })
    return errs
  }

  // Champs obligatoires vides : message classique du navigateur (« Veuillez remplir ce champ. ») sur le premier champ manquant,
  // et non des messages rouges. Les messages personnalisés précédents sont d'abord effacés, sinon un champ corrigé resterait « invalide ».
  // `enteteSeul` (exports) : seuls les champs de l'en-tête sont contrôlés, pas les cellules du tableau des lignes.
  const validerChamps = ({ enteteSeul = false } = {}) => {
    const formulaire = formRef.current
    if (!formulaire) return true
    const champs = [...formulaire.elements]
    champs.forEach((el) => el.setCustomValidity?.(''))
    if (!enteteSeul) return formulaire.reportValidity()
    const invalide = champs.find((el) => el.willValidate && !el.closest('table') && !el.validity.valid)
    if (!invalide) return true
    invalide.reportValidity()
    return false
  }
  const messageChampVide = (e) => {
    if (e.target.validity?.valueMissing) e.target.setCustomValidity('Veuillez remplir ce champ.')
  }

  const enregistrer = async (situation, { doublonConfirme = false } = {}) => {
    if (verrou.current) return
    if (!validerChamps()) return
    if (ocr && !verifie) {
      setError("Cochez « J'ai vérifié les valeurs extraites » avant d'enregistrer : les données lues automatiquement doivent être contrôlées.")
      return
    }
    const erreursLignes = validerLignes()
    if (Object.keys(erreursLignes).length > 0) {
      setErrors(erreursLignes)
      setError('Merci de corriger les champs en rouge avant d’enregistrer.')
      return
    }
    verrou.current = true
    setSaving(true); setErrors({}); setError('')
    try {
      // Données OCR : avant de créer, on signale une déclaration déjà enregistrée pour la même entreprise et la même période.
      if (ocr && !doublonConfirme) {
        const existantes = await listDeclarations('tva', { status: 'actif' }).catch(() => [])
        const meme = (Array.isArray(existantes) ? existantes : []).find((d) => String(d.entrepriseId) === String(form.entreprise_id)
          && d.periodeType === form.periode_type && String(d.periodeValeur) === String(form.periode_valeur) && Number(d.annee) === Number(form.annee))
        if (meme) {
          setDoublon({ id: meme.id, situation })
          return
        }
      }
      const payload = {
        ...form,
        entreprise_id: Number(form.entreprise_id),
        periode_valeur: Number(form.periode_valeur),
        annee: Number(form.annee),
        situation,
        lignes: lignes.map(({ _ocr, _client, ...l }) => ({
          ...l,
          ht: Number(l.ht) || 0, tva: Number(l.tva) || 0, ttc: Number(l.ttc) || 0,
          taux: Number(l.taux) || 0,
          date_paie: l.date_paie || null,
          date_fac: l.date_fac || null,
        })),
      }
      if (isEdit) await updateDeclaration(type, id, payload)
      else await createDeclaration(type, payload)
      navigate(listTo)
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.")
    } finally {
      verrou.current = false
      setSaving(false)
    }
  }

  const err = (k) => errors[k] && <span className="mt-1 block text-xs text-danger-600">{errors[k][0]}</span>

  const entrepriseChoisie = entreprises.find((e) => String(e.id) === String(form.entreprise_id))
  const entrepriseNom = entrepriseChoisie?.denomination ?? ''

  // Importateur de factures : si l'émetteur lu sur la facture est l'entreprise qui déclare (même ICE), c'est une facture de VENTE : la
  // colonne fournisseur/client doit alors décrire le CLIENT. Proposé (jamais appliqué d'office) quand le client a été lu.
  const chiffres = (v) => String(v ?? '').replace(/\D/g, '')
  const estFactureDeVente = (l) => Boolean(l._client?.ice) && Boolean(chiffres(entrepriseChoisie?.ice)) && chiffres(entrepriseChoisie.ice) === chiffres(l.ice)
  const utiliserLeClient = (i) => setLignes((ls) => ls.map((l, idx) => (idx === i
    ? { ...l, libelle_fournisseur: l._client.nom ?? '', ice: l._client.ice ?? '', identifiant_fiscal: '', _client: null, _ocr: { ...l._ocr, identifiant_fiscal: 'IF du client non lu : à saisir' } }
    : l)))

  // ---- Exports ZIP / XML / XLS : fichiers RÉELS générés à partir des lignes affichées (enregistrées ou non).
  // Données obligatoires contrôlées avant (mêmes règles qu'à l'enregistrement) ; en cas d'erreur, un message explicite liste
  // chaque problème et rien n'est modifié : le formulaire et les lignes saisies sont conservés. Le message de succès n'apparaît
  // qu'après la génération effective du fichier.
  const exporter = (format) => {
    // Champs obligatoires vides (entreprise, Client IF, période, année, régime) : message classique « Veuillez remplir ce champ. ».
    if (!validerChamps({ enteteSeul: true })) return
    const donnees = donneesDepuisFormulaire(form, lignes, entrepriseNom)
    const { messages, champs } = validerExport(donnees)
    if (messages.length > 0) {
      setErrors((e) => ({ ...e, ...champs }))
      setErreursExport(messages)
      return
    }
    setErreursExport([])
    try {
      const fichier = genererExport(format, donnees, type)
      telecharger(fichier)
      toast.success(`Fichier « ${fichier.nom} » généré (${Math.max(1, Math.round(fichier.octets.length / 1024))} Ko).`)
    } catch (e) {
      setErreursExport([`L’export a échoué : ${e instanceof Error ? e.message : 'erreur inconnue'}. Vos données sont conservées.`])
    }
  }

  const boutonExport = (format, label, Icon, classes, titre) => (
    <button
      type="button"
      onClick={() => exporter(format)}
      title={titre}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold whitespace-nowrap text-white shadow-sm transition-colors focus-ring ${classes}`}
    >
      <Icon size={15} /> {label}
    </button>
  )
  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={() => { setErreurChargement(''); charger() }}>{erreurChargement}</Alert>}
      {erreursExport.length > 0 && (
        <Alert tone="danger" className="mb-3" title="Export impossible : corrigez les points suivants." onClose={() => setErreursExport([])}>
          <ul className="list-disc space-y-0.5 pl-5">{erreursExport.map((m) => <li key={m}>{m}</li>)}</ul>
        </Alert>
      )}

      {/* Section « Chiffre d'Affaire » : masquée par défaut, la flèche l'ouvre (page Déclaration TVA uniquement). */}
      {type === 'tva' && <SectionChiffreAffaire form={form} />}

      {/* Un seul cadre, pleine largeur — titre, champs, lignes, totaux et
          boutons Sauvegarder dans le même bloc blanc. */}
      <form ref={formRef} onSubmit={(e) => e.preventDefault()} onInvalidCapture={messageChampVide} onInput={(e) => e.target.setCustomValidity?.('')}>
      <FormCard
        title={isEdit ? `Modifier — ${titre}` : titre}
        action={avecExportsComplets ? (
          <div className="flex flex-wrap items-center gap-2">
            {boutonExport('zip', 'ZIP', FileArchive, 'bg-info-500 hover:bg-info-600', 'Télécharger une archive ZIP (XML + Excel)')}
            {boutonExport('xml', 'XML', FileCode2, 'bg-warning-500 hover:bg-warning-600', 'Télécharger le fichier XML')}
            {boutonExport('xls', 'XLS', FileSpreadsheet, 'bg-success-500 hover:bg-success-600', 'Télécharger le classeur Excel (.xlsx)')}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {boutonExport('xls', 'Exporter Excel', FileSpreadsheet, 'bg-success-500 hover:bg-success-600', 'Télécharger le classeur Excel (.xlsx)')}
          </div>
        )}
        footer={(
          <FormActions>
            <Button type="button" variant="primary" loading={saving} disabled={Boolean(ocr) && !verifie} onClick={() => enregistrer('non_declaree')} icon={<Save size={16} />}>
              Sauvegarder (Non Déclaré)
            </Button>
            <Button type="button" variant="success" loading={saving} disabled={Boolean(ocr) && !verifie} onClick={() => enregistrer('declaree')} icon={<Save size={16} />}>
              Sauvegarder (Déclarée)
            </Button>
          </FormActions>
        )}
      >
        {ocr && (
          <div className="mb-5 space-y-3">
            <Alert tone="warning">
              <span className="font-semibold">Données extraites de « {ocr.fichier} » — à vérifier.</span>{' '}
              Les cases surlignées sont incertaines ; tout reste modifiable.
              {ocr.avertissements?.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5">{ocr.avertissements.map((a) => <li key={a}>{a}</li>)}</ul>
              )}
              {ocr.controles?.filter((c) => c.niveau === 'alerte').length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5">{ocr.controles.filter((c) => c.niveau === 'alerte').map((c) => <li key={c.message}>{c.message}</li>)}</ul>
              )}
            </Alert>
            <Checkbox
              checked={verifie}
              onChange={(e) => setVerifie(e.target.checked)}
              label="J'ai vérifié les valeurs extraites."
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Field label="Sélectionner Entreprise" required>
            <SelectRecherche
              required
              options={optionsEntreprises(entreprises)}
              value={form.entreprise_id}
              onChange={choisirEntreprise}
              placeholder="Sélectionner Entreprise"
            />
            {err('entreprise_id')}
          </Field>
          <Field label="Client IF" required>
            <Input required value={form.client_if} onChange={set('client_if')} placeholder="Client IF" />
            {err('client_if')}
          </Field>
          <Field label="Identifiant de Paiement">
            <Select value={form.identifiant_paiement} onChange={set('identifiant_paiement')}>
              {optionsIdentifiantPaiement(form.identifiant_paiement).map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Selectionner Periode" required>
              <Select value={form.periode_type} onChange={set('periode_type')}>
                <option value="trimestre">PERIODE(Trimestre)</option>
                <option value="mois">PERIODE(Mois)</option>
              </Select>
            </Field>
            <Field label="&nbsp;">
              <Select required value={form.periode_valeur} onChange={set('periode_valeur')}>
                <option value="">Sélectionner Période</option>
                {(form.periode_type === 'trimestre' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).map((v) => (
                  <option key={v} value={v}>{form.periode_type === 'trimestre' ? `Trimestre ${v}` : `Mois ${v}`}</option>
                ))}
              </Select>
              {err('periode_valeur')}
            </Field>
          </div>

          <Field label="Annee" required>
            <Input type="number" required min="2000" max="2100" value={form.annee} onChange={set('annee')} />
            {err('annee')}
          </Field>
          <Field label="Regime(Encaissement-2)" required>
            <Input required value={form.regime} onChange={set('regime')} placeholder="2" />
            {err('regime')}
          </Field>
        </div>

        {/* Tableau classique : en-têtes sur toutes les colonnes de la capture, cellules bordées, montants alignés à droite en
            chiffres tabulaires, largeurs minimales (le tableau défile horizontalement plutôt que de couper une valeur). */}
        <div className="mt-6 overflow-hidden rounded-lg border border-line">
          <table className="w-full table-fixed border-collapse text-[12px]">
            <colgroup>
              {COLONNES_LIGNE.map((c) => <col key={c.cle} style={{ width: `${PART_COLONNE[c.cle]}%` }} />)}
              <col style={{ width: '2.5rem' }} />
            </colgroup>
            <thead>
              <tr className="bg-surface text-[12px] font-medium tracking-wide text-ink-950 uppercase">
                {COLONNES_LIGNE.map((c) => (
                  <th key={c.cle} scope="col" className={`border border-line px-1 py-2.5 leading-tight break-words ${c.droite ? 'text-right' : 'text-center'}`}>
                    {c.label}
                  </th>
                ))}
                <th scope="col" className="border border-line px-1 py-2.5"><span className="sr-only">Retirer la ligne</span></th>
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={COLONNES_LIGNE.length + 1} className="border border-line py-8 text-center text-sm text-ink-600">
                    Aucune ligne. Cliquez sur « Ajouter » pour commencer la saisie.
                  </td>
                </tr>
              ) : lignes.map((l, i) => {
                // Avertissements visuels seulement, sans message : la CELLULE du numéro en rouge (doublon), celle du TTC en orange
                // (espèces > 5 000 Dh). Jamais la ligne entière ; aucun ne bloque l'enregistrement.
                const doublon = doublons.get(i)
                const especes = analyseEspeces.lignesSignalees.has(i)
                return (
                <tr key={i} className="align-top transition-colors hover:bg-brand-50/40">
                  {COLONNES_LIGNE.map((c) => {
                    const incertain = l._ocr?.[c.cle]
                    const message = errors[`lignes.${i}.${c.cle}`]?.[0]
                    const fond = fondDeCellule(c.cle, { doublon: Boolean(doublon), especes })
                    return (
                      <td key={c.cle} data-alerte={fond.cellule ? (c.cle === 'fact_num' ? 'doublon' : 'especes') : undefined} className={`border border-line p-1 ${fond.cellule}`}>
                        <div className={incertain ? 'rounded-md ring-2 ring-warning-500' : ''} title={incertain || undefined}>
                          <CelluleInput
                            type={c.type || 'text'}
                            step={c.type === 'number' ? '0.01' : undefined}
                            min={c.cle === 'taux' ? 0 : undefined}
                            max={c.cle === 'taux' ? 100 : undefined}
                            value={l[c.cle]}
                            // Données lues par l'importateur : un montant ou un taux non lu doit être saisi (sinon il serait enregistré comme 0).
                            required={Boolean(ocr) && (c.cle === 'ht' || c.cle === 'tva' || c.cle === 'taux')}
                            onChange={(e) => majLigne(i, c.cle, e.target.value)}
                            erreur={Boolean(message)}
                            aria-label={`${c.label}, ligne ${i + 1}`}
                            className={`${c.cle === 'taux' ? 'px-0.5!' : 'px-1.5!'} text-[12px]! ${c.droite ? 'tabular text-right' : c.centre ? 'text-center' : ''} ${c.cle === 'taux' ? 'appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none' : ''} ${fond.champ}`}
                          />
                        </div>
                        {incertain && <span className="mt-1 block text-[11px] font-medium text-warning-700">À vérifier : {incertain}</span>}
                        {c.cle === 'libelle_fournisseur' && estFactureDeVente(l) && (
                          <button
                            type="button"
                            onClick={() => utiliserLeClient(i)}
                            className="mt-1 block text-left text-[11px] font-semibold text-brand-600 hover:underline"
                          >
                            Facture émise par l'entreprise choisie : utiliser le client
                          </button>
                        )}
                        {message && <span className="mt-1 block text-[11px] text-danger-600">{message}</span>}
                      </td>
                    )
                  })}
                  <td className="border border-line p-1 text-center">
                    <RowBtn
                      title={`Retirer la ligne ${i + 1}`}
                      onClick={() => setLignes((ls) => ls.filter((_, idx) => idx !== i))}
                      className="hover:bg-danger-50 hover:text-danger-600"
                    >
                      <X size={15} />
                    </RowBtn>
                  </td>
                </tr>
                )
              })}
            </tbody>
            {lignes.length > 0 && (
              <tfoot>
                <tr className="bg-surface font-semibold text-ink-900">
                  <td colSpan={3} className="border border-line px-3 py-2 text-right text-[12px] tracking-wide uppercase">Total ({lignes.length} ligne{lignes.length > 1 ? 's' : ''})</td>
                  <td className="tabular border border-line px-3 py-2 text-right">{totaux.ht.toFixed(2)}</td>
                  <td className="tabular border border-line px-3 py-2 text-right">{totaux.tva.toFixed(2)}</td>
                  <td className="tabular border border-line px-3 py-2 text-right">{totaux.ttc.toFixed(2)}</td>
                  <td colSpan={COLONNES_LIGNE.length - 6 + 1} className="border border-line" />
                </tr>
              </tfoot>
            )}
          </table>
          {errors.lignes && <span className="block border-t border-line px-3 py-2 text-xs text-danger-600">{errors.lignes[0]}</span>}
        </div>
        <Button
          variant="primary"
          fullWidth
          className="mt-3"
          onClick={() => { effacerErreur('lignes'); setLignes((ls) => [...ls, { ...emptyLigne }]) }}
          icon={<Plus size={15} />}
        >
          Ajouter
        </Button>

        <ConfirmDialog
          open={Boolean(doublon)}
          tone="warning"
          title="Déclaration déjà enregistrée"
          confirmLabel="Créer quand même"
          cancelLabel="Annuler"
          onCancel={() => setDoublon(null)}
          onConfirm={() => { const d = doublon; setDoublon(null); enregistrer(d.situation, { doublonConfirme: true }) }}
          message={doublon && `Une déclaration TVA (n° ${doublon.id}) existe déjà pour cette entreprise et cette période. Voulez-vous en créer une seconde ?`}
        />

        {/* Totaux en lecture seule, dérivés des lignes ci-dessus. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <Field label="Total HT"><Input readOnly value={totaux.ht.toFixed(2)} className="bg-slate-100" /></Field>
          <Field label="Total Montant TVA"><Input readOnly value={totaux.tva.toFixed(2)} className="bg-slate-100" /></Field>
          <Field label="Total TTC"><Input readOnly value={totaux.ttc.toFixed(2)} className="bg-slate-100" /></Field>
        </div>
      </FormCard>
      </form>
    </div>
  )
}

// ------------------------------------------------------------------------ Liste

function Liste({ type, titre, editBase, addTo, addLabel }) {
  const navigate = useNavigate()
  const toast = useToast()
  const location = useLocation()
  const [status, setStatus] = useState(() => location.state?.initialStatus || 'actif')
  const [situation, setSituation] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    setErreurChargement('')
    listDeclarations(type, { status, situation })
      .then(setRows)
      .catch((err) => setErreurChargement(err instanceof ApiError && err.status === 403
        ? "Vous n'avez pas la permission de consulter cette liste."
        : 'Impossible de charger la liste.'))
      .finally(() => setLoading(false))
  }, [type, status, situation])

  useEffect(load, [load])

  const run = async (fn, message) => {
    try {
      await fn()
      toast.success(message)
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action n'a pas pu être effectuée.")
    }
  }

  // Téléchargement d'une déclaration enregistrée dans le format choisi (xls = Excel .xlsx, xml, zip = XML + Excel) : elle est relue
  // sur l'API, contrôlée, puis le fichier réel est généré. Le message de succès n'apparaît qu'une fois le fichier réellement produit.
  const telechargerDepuisListe = async (r, format) => {
    try {
      const donnees = donneesDepuisApi(await getDeclaration(type, r.id))
      const { messages } = validerExport(donnees)
      if (messages.length > 0) {
        toast.error(`Export impossible : ${messages[0]}${messages.length > 1 ? ` (+ ${messages.length - 1} autre(s) point(s))` : ''} Ouvrez la déclaration pour la compléter.`)
        return
      }
      const fichier = genererExport(format, donnees, type)
      telecharger(fichier)
      toast.success(`Fichier « ${fichier.nom} » généré.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'L’export a échoué : la déclaration n’a pas pu être lue.')
    }
  }

  const columns = [
    { key: 'situation', header: 'Situation', value: (r) => r.situation, render: (r) => <SituationBadge situation={r.situation} /> },
    { key: 'nomComplet', header: 'Nom Complet', clamp: 2, render: (r) => <span className="font-semibold text-brand-700">{r.nomComplet}</span> },
    { key: 'periode', header: 'Periode' },
    { key: 'annee', header: 'Annee' },
    { key: 'totalHt', header: 'HT', value: (r) => r.totalHt, render: (r) => dh(r.totalHt) },
    { key: 'totalTva', header: 'TVA', value: (r) => r.totalTva, render: (r) => dh(r.totalTva) },
    { key: 'totalTtc', header: 'TTC', value: (r) => r.totalTtc, render: (r) => dh(r.totalTtc) },
    { key: 'date', header: 'Date' },
  ]

  const exportColumns = columns.map((c) => ({ header: c.header, value: (r) => (c.value ? c.value(r) : r[c.key]) }))

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurChargement && <Alert tone="danger" className="mb-3" onRetry={load}>{erreurChargement}</Alert>}

      <DataTable
        title={titre}
        filterCentre
        filter={(
          <>
            {status !== 'actif' && (
              <Button variant="secondary" onClick={() => setStatus('actif')} icon={<ArrowLeft size={15} />}>
                Retour à la liste
              </Button>
            )}
            <div className="w-full sm:flex-1">
              <Select value={situation} onChange={(e) => setSituation(e.target.value)}>
                <option value="">Toutes les situations</option>
                <option value="declaree">Déclarée</option>
                <option value="non_declaree">Non Déclaré</option>
              </Select>
            </div>
          </>
        )}
        actions={(
          <>
            <Button variant="success" to={addTo} icon={<Plus size={16} />}>{addLabel}</Button>
            <ExportMenu
              filename={`${type}-${status}`}
              title={titre}
              columns={exportColumns}
              rows={rows}
              disabled={rows.length === 0}
            />
            <IconButton
              variant="warning"
              title={status === 'archive' ? 'Revenir aux éléments actifs' : 'Voir les archives'}
              aria-pressed={status === 'archive'}
              onClick={() => setStatus((v) => (v === 'archive' ? 'actif' : 'archive'))}
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              variant="dark"
              title={status === 'corbeille' ? 'Revenir aux éléments actifs' : 'Voir la corbeille'}
              aria-pressed={status === 'corbeille'}
              onClick={() => setStatus((v) => (v === 'corbeille' ? 'actif' : 'corbeille'))}
            >
              <Trash2 size={18} />
            </IconButton>
          </>
        )}
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText={status === 'actif' ? 'Aucune ligne' : status === 'archive' ? 'Aucune ligne archivée' : 'Corbeille vide'}
        actionsHeader="ACTION"
        rowActions={(r) => (
            <div className="flex justify-end gap-1.5">
              <ActionMenu
                label="Télécharger"
                icon={<Download />}
                items={[
                  { label: 'Excel (.xlsx)', icon: <FileSpreadsheet size={15} />, onClick: () => telechargerDepuisListe(r, 'xls') },
                  { label: 'XML (.xml)', icon: <FileCode2 size={15} />, onClick: () => telechargerDepuisListe(r, 'xml') },
                  { label: 'ZIP (.zip)', icon: <FileArchive size={15} />, onClick: () => telechargerDepuisListe(r, 'zip') },
                ]}
              />
              <ActionMenu
                label="Actions"
                icon={<IconeActions />}
                items={
                  status === 'actif' ? [
                    { label: 'Modifier', icon: <IconeModifier size={15} />, onClick: () => navigate(`${editBase}/${r.id}/modifier`) },
                    {
                      label: 'Archiver',
                      icon: <Archive size={15} />,
                      tone: 'warning',
                      onClick: () => setConfirm({
                        title: 'Archiver cette ligne ?',
                        message: `« ${r.nomComplet} » sera déplacée dans les archives.`,
                        confirmLabel: 'Archiver',
                        run: () => run(() => archiveDeclaration(type, r.id), 'Ligne archivée.'),
                      }),
                    },
                    {
                      label: 'Corbeille',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => setConfirm({
                        title: 'Mettre cette ligne à la corbeille ?',
                        message: `« ${r.nomComplet} » sera déplacée dans la corbeille.`,
                        confirmLabel: 'Corbeille',
                        run: () => run(() => corbeilleDeclaration(type, r.id), 'Ligne placée dans la corbeille.'),
                      }),
                    },
                  ] : status === 'archive' ? [
                    { label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreDeclaration(type, r.id), 'Ligne restaurée.') },
                  ] : [
                    { label: 'Restaurer', icon: <RotateCcw size={15} />, onClick: () => run(() => restoreDeclaration(type, r.id), 'Ligne restaurée.') },
                    {
                      label: 'Supprimer définitivement',
                      icon: <Trash2 size={15} />,
                      tone: 'danger',
                      onClick: () => setConfirm({
                        message: 'Supprimer définitivement cette ligne ? Cette action est irréversible.',
                        run: () => run(() => deleteDeclarationForever(type, r.id), 'Ligne supprimée définitivement.'),
                      }),
                    },
                  ]
                }
              />
            </div>
          )}
        />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        confirmLabel={confirm?.confirmLabel}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c?.run() }}
      />
    </div>
  )
}

// -------------------------------------------------------------------- Exports

export function DeclarationForm() {
  return <Formulaire type="tva" titre="Nouvelle Declaration" listTo="/declaration-tva" avecExportsComplets />
}

export function DeclarationList() {
  return (
    <Liste
      type="tva"
      titre="Liste des Déclarations de TVA"
      editBase="/declaration-tva"
      addTo="/declaration-tva/nouvelle"
      addLabel="Nouvelle Declaration"
    />
  )
}

export function ChiffreAffairesForm() {
  return <Formulaire type="chiffre_affaire" titre="Chiffre d'Affaire" listTo="/declaration-tva/chiffre-affaires" />
}

export function ChiffreAffairesList() {
  return (
    <Liste
      type="chiffre_affaire"
      titre="Liste des Chiffre d'Affaire"
      editBase="/declaration-tva/chiffre-affaires"
      addTo="/declaration-tva/chiffre-affaires/nouveau"
      addLabel="Ajouter Chiffre d'Affaire"
    />
  )
}
