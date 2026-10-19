import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, FileUp, ListChecks, RotateCcw, ShieldCheck } from 'lucide-react'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { Checkbox, Field, FormActions, FormCard, Input, Select } from '../components/Field.jsx'
import SelectRecherche from '../components/SelectRecherche.jsx'
import { clientIfApresChoix, optionsEntreprises } from '../utils/rechercheOptions.js'
import { IDENTIFIANT_PAIEMENT_PAR_DEFAUT, optionsIdentifiantPaiement } from '../utils/identifiantsPaiement.js'
import { useAuth } from '../context/AuthContext.jsx'
import { ApiError } from '../api/http.js'
import { listEntreprises } from '../api/entreprises.js'
import { listDeclarations } from '../api/declarationsTva.js'
import { apercuImport, importerLignes } from '../api/importateurTva.js'
import { EN_TETES_MODELE, ErreurFichier, LIBELLES, LIMITES, lireFichierTva, modeleCsv } from '../utils/importFichierTva.js'

/**
 * Import de LIGNES depuis un fichier Excel / CSV vers une Déclaration TVA (outil distinct de l'« Importateur de Déclaration »,
 * qui, lui, concerne la photo d'une déclaration : voir ImportateurTva.jsx). Page conservée telle quelle, accessible par
 * /declaration-tva/importateur/fichier ; elle n'a pas d'entrée de menu.
 *
 * Fonctionnement :
 *
 * Parcours : 1. cible (déclaration « Non Déclarée » existante, ou nouvelle déclaration) → 2. fichier (lu dans le navigateur)
 * → 3. vérification par le serveur (AUCUNE écriture) : lignes valides, doublons, rejets avec leur numéro et leur raison
 * → 4. confirmation → 5. bilan. Rien n'est enregistré avant la confirmation ; l'enregistrement est tout ou rien.
 */

const dh = (v) => `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dh`
const AFFICHAGE_MAX = 200

const ETATS = {
  valide: { label: 'Valide', cls: 'bg-emerald-50 text-emerald-700' },
  doublon: { label: 'Doublon', cls: 'bg-amber-50 text-amber-700' },
  rejetee: { label: 'Rejetée', cls: 'bg-rose-50 text-rose-700' },
}

function messageErreur(err, defaut) {
  if (err instanceof ApiError) {
    const premiere = err.errors && Object.values(err.errors)[0]?.[0]
    return premiere || err.message || defaut
  }
  if (err instanceof ErreurFichier) return err.message
  return defaut
}

const FORM_NOUVELLE_VIDE = {
  entreprise_id: '', client_if: '', identifiant_paiement: IDENTIFIANT_PAIEMENT_PAR_DEFAUT,
  periode_type: 'trimestre', periode_valeur: '', annee: String(new Date().getFullYear()), regime: '2',
}

function Compteur({ valeur, label, tone }) {
  return (
    <div className={`rounded-lg px-4 py-3 ${tone}`}>
      <div className="tabular text-2xl font-bold">{valeur}</div>
      <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
    </div>
  )
}

export default function ImportateurTvaFichier() {
  const { hasPermission } = useAuth()
  const peutImporter = hasPermission('declaration', 'importeur')
  const peutCibler = hasPermission('declaration', 'modifier') && hasPermission('declaration', 'liste')
  const peutCreer = hasPermission('declaration', 'ajouter') && hasPermission('declaration', 'sauvegarder_non_declare')

  const [mode, setMode] = useState(peutCibler ? 'existante' : 'nouvelle')
  const [declarations, setDeclarations] = useState([])
  const [erreurDeclarations, setErreurDeclarations] = useState('')
  const [declarationId, setDeclarationId] = useState('')
  const [entreprises, setEntreprises] = useState([])
  const [nouvelle, setNouvelle] = useState(FORM_NOUVELLE_VIDE)

  const [lu, setLu] = useState(null)
  const [erreurFichier, setErreurFichier] = useState('')
  const [lecture, setLecture] = useState(false)
  const champFichier = useRef(null)

  const [apercu, setApercu] = useState(null)
  const [verification, setVerification] = useState(false)
  const [erreur, setErreur] = useState('')
  const [filtre, setFiltre] = useState('tous')
  const [afficherTout, setAfficherTout] = useState(false)
  const [ignorerRejetees, setIgnorerRejetees] = useState(false)
  const [confirmation, setConfirmation] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [bilan, setBilan] = useState(null)

  const set = (k) => (e) => { setNouvelle((f) => ({ ...f, [k]: e.target.value })); reinitialiserApercu() }

  function reinitialiserApercu() {
    setApercu(null)
    setErreur('')
    setIgnorerRejetees(false)
    setFiltre('tous')
    setAfficherTout(false)
  }

  const chargerDeclarations = useCallback(() => {
    if (!peutCibler) return
    listDeclarations('tva', { status: 'actif', situation: 'non_declaree' })
      .then((r) => { setDeclarations(Array.isArray(r) ? r : []); setErreurDeclarations('') })
      .catch((e) => setErreurDeclarations(messageErreur(e, 'Impossible de charger les déclarations.')))
  }, [peutCibler])

  useEffect(() => { chargerDeclarations() }, [chargerDeclarations])
  useEffect(() => {
    if (peutCreer) listEntreprises('actif').then(setEntreprises).catch(() => setEntreprises([]))
  }, [peutCreer])

  const cible = useMemo(() => {
    if (mode === 'existante') return declarationId ? { type: 'existante', declaration_id: Number(declarationId) } : null
    const { entreprise_id: e, client_if: i, periode_valeur: p, annee } = nouvelle
    if (!e || !i.trim() || !p || !annee) return null
    return {
      type: 'nouvelle',
      entreprise_id: Number(e),
      client_if: nouvelle.client_if.trim(),
      identifiant_paiement: nouvelle.identifiant_paiement.trim() || null,
      periode_type: nouvelle.periode_type,
      periode_valeur: Number(p),
      annee: Number(annee),
      regime: nouvelle.regime.trim() || null,
    }
  }, [mode, declarationId, nouvelle])

  const choisirFichier = async (fichier) => {
    reinitialiserApercu()
    setBilan(null)
    setLu(null)
    setErreurFichier('')
    if (!fichier) return
    setLecture(true)
    try {
      setLu({ nom: fichier.name, ...(await lireFichierTva(fichier)) })
    } catch (e) {
      setErreurFichier(messageErreur(e, 'Ce fichier ne peut pas être lu.'))
    } finally {
      setLecture(false)
    }
  }

  const verifier = async () => {
    setVerification(true)
    reinitialiserApercu()
    setBilan(null)
    try {
      setApercu(await apercuImport(cible, lu.lignes))
    } catch (e) {
      setErreur(messageErreur(e, 'La vérification du fichier a échoué.'))
    } finally {
      setVerification(false)
    }
  }

  const importer = async () => {
    setEnregistrement(true)
    setErreur('')
    try {
      setBilan(await importerLignes(cible, lu.lignes, { ignorerRejetees }))
      setConfirmation(false)
      setApercu(null)
      setLu(null)
      if (champFichier.current) champFichier.current.value = ''
      chargerDeclarations()
    } catch (e) {
      setConfirmation(false)
      setErreur(messageErreur(e, "L'import a échoué : rien n'a été enregistré."))
    } finally {
      setEnregistrement(false)
    }
  }

  const recommencer = () => {
    setBilan(null)
    setLu(null)
    setApercu(null)
    setErreur('')
    setErreurFichier('')
    if (champFichier.current) champFichier.current.value = ''
  }

  const telechargerModele = () => {
    const url = URL.createObjectURL(new Blob([modeleCsv()], { type: 'text/csv;charset=utf-8' }))
    const lien = document.createElement('a')
    lien.href = url
    lien.download = 'modele-importateur-tva.csv'
    lien.click()
    URL.revokeObjectURL(url)
  }

  const lignesFiltrees = useMemo(() => {
    if (!apercu) return []
    const etat = { valides: 'valide', doublons: 'doublon', rejetees: 'rejetee' }[filtre]
    return apercu.lignes.filter((l) => !etat || l.etat === etat)
  }, [apercu, filtre])
  const lignesAffichees = afficherTout ? lignesFiltrees : lignesFiltrees.slice(0, AFFICHAGE_MAX)

  if (!peutImporter) {
    return (
      <FormCard title="Importateur de TVA — fichier Excel / CSV">
        <Alert tone="danger">Vous n'avez pas la permission d'utiliser l'Importateur de TVA (Paramètres → Assistance → Déclaration → Importeur).</Alert>
      </FormCard>
    )
  }
  if (!peutCibler && !peutCreer) {
    return (
      <FormCard title="Importateur de TVA — fichier Excel / CSV">
        <Alert tone="warning">
          L'Importateur de TVA demande aussi un droit sur la Déclaration TVA : « Modifier » et « Liste » pour compléter une déclaration
          existante, ou « Ajouter » et « Sauvegarder (Non Déclaré) » pour en créer une.
        </Alert>
      </FormCard>
    )
  }

  const resume = apercu?.resume
  const bloqueParRejets = resume && resume.rejetees > 0 && !ignorerRejetees
  const peutLancer = Boolean(resume && resume.valides > 0 && !bloqueParRejets && !enregistrement)

  return (
    <div className="space-y-6">
      {bilan && (
        <FormCard title="Bilan de l'import">
          <Alert tone="success" className="mb-4">
            Import terminé : {bilan.importees} ligne(s) ajoutée(s) à la déclaration n° {bilan.declaration.id}
            {bilan.cible?.entreprise ? ` (${bilan.cible.entreprise})` : ''}.
          </Alert>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Compteur valeur={bilan.importees} label="Importées" tone="bg-emerald-50 text-emerald-700" />
            <Compteur valeur={bilan.resume.doublons} label="Ignorées (doublons)" tone="bg-amber-50 text-amber-700" />
            <Compteur valeur={bilan.resume.rejetees} label="Rejetées (non importées)" tone="bg-rose-50 text-rose-700" />
            <Compteur valeur={bilan.declaration.nombre_lignes} label="Lignes dans la déclaration" tone="bg-surface text-ink-800" />
          </div>
          <p className="mt-4 text-sm text-ink-800">
            Totaux de la déclaration : HT {dh(bilan.declaration.total_ht)} · TVA {dh(bilan.declaration.total_tva)} · TTC {dh(bilan.declaration.total_ttc)}
          </p>
          {bilan.lignes.some((l) => l.etat !== 'valide') && (
            <div className="mt-4"><TableLignes lignes={bilan.lignes.filter((l) => l.etat !== 'valide')} /></div>
          )}
          <FormActions className="mt-4 -mx-6 -mb-6">
            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={recommencer}>Nouvel import</Button>
            <Button variant="primary" to={`/declaration-tva/${bilan.declaration.id}/modifier`} icon={<ListChecks size={16} />}>Ouvrir la déclaration</Button>
          </FormActions>
        </FormCard>
      )}

      {erreur && <Alert tone="danger" onAutoClose={() => setErreur('')}>{erreur}</Alert>}

      <FormCard
        title="Importateur de TVA — fichier Excel / CSV"
        action={(
          <Button type="button" variant="secondary" icon={<Download size={16} />} onClick={telechargerModele}>
            Télécharger le modèle (CSV)
          </Button>
        )}
      >
        <p className="mb-5 text-sm text-ink-700">
          Ajoutez à une Déclaration TVA les lignes d'un fichier Excel (.xlsx) ou CSV. Le fichier est d'abord vérifié : rien n'est
          enregistré avant votre confirmation, et les lignes déjà présentes ne sont jamais écrasées ni dupliquées.
        </p>

        <div className="mb-3 text-sm font-semibold text-ink-900">1. Déclaration concernée</div>
        <div className="mb-5 flex flex-wrap gap-6">
          <label className={`flex items-center gap-2 text-sm ${peutCibler ? '' : 'opacity-50'}`}>
            <input type="radio" name="mode" checked={mode === 'existante'} disabled={!peutCibler} onChange={() => { setMode('existante'); reinitialiserApercu() }} />
            Compléter une déclaration « Non Déclaré » existante
          </label>
          <label className={`flex items-center gap-2 text-sm ${peutCreer ? '' : 'opacity-50'}`}>
            <input type="radio" name="mode" checked={mode === 'nouvelle'} disabled={!peutCreer} onChange={() => { setMode('nouvelle'); reinitialiserApercu() }} />
            Créer une nouvelle déclaration
          </label>
        </div>

        {mode === 'existante' ? (
          <div className="max-w-xl">
            {erreurDeclarations && <Alert tone="danger" className="mb-3" onRetry={chargerDeclarations}>{erreurDeclarations}</Alert>}
            <Field label="Déclaration (situation « Non Déclaré »)" required hint="Les déclarations déjà « Déclarées » ne peuvent pas recevoir de lignes.">
              <Select value={declarationId} onChange={(e) => { setDeclarationId(e.target.value); reinitialiserApercu() }}>
                <option value="">Sélectionner une déclaration</option>
                {declarations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {`${d.nomComplet ?? 'Entreprise'} — ${d.periode} ${d.annee} (n° ${d.id}, ${(d.lignes ?? []).length} ligne(s))`}
                  </option>
                ))}
              </Select>
            </Field>
            {declarations.length === 0 && !erreurDeclarations && (
              <p className="text-xs text-ink-600">Aucune déclaration « Non Déclaré » : créez-en une nouvelle depuis ce fichier.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Field label="Entreprise" required>
              <SelectRecherche
                options={optionsEntreprises(entreprises)}
                value={nouvelle.entreprise_id}
                onChange={(valeur) => {
                  setNouvelle((f) => ({ ...f, entreprise_id: valeur, client_if: clientIfApresChoix(entreprises, f.entreprise_id, valeur, f.client_if).slice(0, 30) }))
                  reinitialiserApercu()
                }}
                placeholder="Sélectionner Entreprise"
              />
            </Field>
            <Field label="Client IF" required><Input value={nouvelle.client_if} onChange={set('client_if')} placeholder="Client IF" maxLength={30} /></Field>
            <Field label="Identifiant de Paiement">
              <Select value={nouvelle.identifiant_paiement} onChange={set('identifiant_paiement')}>
                {optionsIdentifiantPaiement(nouvelle.identifiant_paiement).map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Période" required>
                <Select value={nouvelle.periode_type} onChange={(e) => { setNouvelle((f) => ({ ...f, periode_type: e.target.value, periode_valeur: '' })); reinitialiserApercu() }}>
                  <option value="trimestre">Trimestre</option>
                  <option value="mois">Mois</option>
                </Select>
              </Field>
              <Field label="&nbsp;">
                <Select value={nouvelle.periode_valeur} onChange={set('periode_valeur')}>
                  <option value="">Sélectionner</option>
                  {(nouvelle.periode_type === 'trimestre' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).map((v) => (
                    <option key={v} value={v}>{nouvelle.periode_type === 'trimestre' ? `Trimestre ${v}` : `Mois ${v}`}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Année" required><Input type="number" min="2000" max="2100" value={nouvelle.annee} onChange={set('annee')} /></Field>
            <Field label="Régime (Encaissement-2)"><Input value={nouvelle.regime} onChange={set('regime')} placeholder="2" maxLength={40} /></Field>
          </div>
        )}

        <div className="mt-8 mb-3 text-sm font-semibold text-ink-900">2. Fichier Excel ou CSV</div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={champFichier}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => choisirFichier(e.target.files?.[0])}
            className="block text-sm text-ink-800 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-600 hover:file:bg-brand-100"
          />
          {lecture && <span className="text-sm text-ink-600">Lecture du fichier…</span>}
        </div>
        <p className="mt-2 text-xs text-ink-600">
          .xlsx, .csv ou export .xls du projet · {LIMITES.tailleMax / 1024 / 1024} Mo et {LIMITES.lignesMax} lignes au maximum · colonnes : {EN_TETES_MODELE.join(' · ')}
          {' '}(HT et TVA obligatoires ; TTC est calculé s'il est vide ; taux vide = 20 ; dates AAAA-MM-JJ ou JJ/MM/AAAA). Pour IF et ICE, mettez la colonne au format Texte pour conserver les zéros du début.
        </p>
        {erreurFichier && <Alert tone="danger" className="mt-3" onAutoClose={() => setErreurFichier('')}>{erreurFichier}</Alert>}

        {lu && (
          <div className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-800">
            <div className="flex items-center gap-2 font-semibold"><FileSpreadsheet size={16} /> {lu.nom}</div>
            <div className="mt-1">
              {lu.lignes.length} ligne(s) de données lue(s)
              {lu.videsIgnorees > 0 ? ` · ${lu.videsIgnorees} ligne(s) vide(s) ignorée(s)` : ''}
              {lu.feuille ? ` · feuille « ${lu.feuille} »` : ''}
            </div>
            <div className="mt-1 text-xs text-ink-600">
              Colonnes reconnues : {lu.colonnes.filter((c) => c.champ).map((c) => LIBELLES[c.champ]).join(', ')}
            </div>
            {lu.avertissements.map((a) => <div key={a} className="mt-1 text-xs text-warning-700">{a}</div>)}
          </div>
        )}

        <div className="mt-6">
          <Button
            type="button"
            variant="primary"
            icon={<ShieldCheck size={16} />}
            loading={verification}
            disabled={!lu || !cible || verification}
            onClick={verifier}
          >
            3. Vérifier le fichier
          </Button>
          {!cible && <span className="ml-3 text-xs text-ink-600">Complétez d'abord la déclaration concernée.</span>}
        </div>
      </FormCard>

      {apercu && resume && (
        <FormCard
          title="Résultat de la vérification"
          footer={(
            <FormActions>
              <Button type="button" variant="secondary" onClick={() => { reinitialiserApercu(); setApercu(null) }}>Annuler</Button>
              <Button type="button" variant="primary" icon={<FileUp size={16} />} disabled={!peutLancer} onClick={() => setConfirmation(true)}>
                Importer {resume.valides} ligne(s)
              </Button>
            </FormActions>
          )}
        >
          <Alert tone="info" className="mb-4">
            Cible : {apercu.cible.type === 'nouvelle' ? 'nouvelle déclaration' : `déclaration n° ${apercu.cible.declaration_id}`} — {apercu.cible.entreprise ?? 'Entreprise'} ·{' '}
            {apercu.cible.periode} {apercu.cible.annee}
            {apercu.cible.lignes_existantes > 0 ? ` · ${apercu.cible.lignes_existantes} ligne(s) déjà enregistrée(s)` : ''}. Aucune donnée n'a encore été enregistrée.
          </Alert>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Compteur valeur={resume.total} label="Lignes du fichier" tone="bg-surface text-ink-800" />
            <Compteur valeur={resume.valides} label="Prêtes à importer" tone="bg-emerald-50 text-emerald-700" />
            <Compteur valeur={resume.doublons} label="Ignorées (doublons)" tone="bg-amber-50 text-amber-700" />
            <Compteur valeur={resume.rejetees} label="Rejetées" tone="bg-rose-50 text-rose-700" />
          </div>
          <p className="mt-3 text-sm text-ink-800">
            Lignes prêtes : HT {dh(apercu.totaux.ht)} · TVA {dh(apercu.totaux.tva)} · TTC {dh(apercu.totaux.ttc)}
          </p>

          {apercu.alertes_especes.length > 0 && (
            <Alert tone="warning" className="mt-4">
              <span className="font-semibold">Seuil espèces dépassé ({dh(5000)}) :</span>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {apercu.alertes_especes.map((a) => (
                  <li key={a.identifiant_fiscal}>IF {a.identifiant_fiscal} — cumul espèces {dh(a.total)} sur {a.nb_lignes} facture(s) (lignes importées : {a.lignes.join(', ')})</li>
                ))}
              </ul>
            </Alert>
          )}

          {resume.rejetees > 0 && (
            <div className="mt-4 rounded-lg border border-danger-200 bg-danger-50/40 px-4 py-3">
              <p className="text-sm font-semibold text-danger-700">{resume.rejetees} ligne(s) rejetée(s) : elles ne seront pas importées.</p>
              <div className="mt-2">
                <Checkbox
                  checked={ignorerRejetees}
                  onChange={(e) => setIgnorerRejetees(e.target.checked)}
                  label={`Importer uniquement les ${resume.valides} ligne(s) valide(s) et laisser de côté les lignes rejetées (corrigez le fichier pour les importer ensuite)`}
                />
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {[['tous', `Toutes (${resume.total})`], ['valides', `Valides (${resume.valides})`], ['doublons', `Doublons (${resume.doublons})`], ['rejetees', `Rejetées (${resume.rejetees})`]].map(([cle, libelle]) => (
              <button
                key={cle}
                type="button"
                onClick={() => { setFiltre(cle); setAfficherTout(false) }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors focus-ring ${filtre === cle ? 'bg-brand-500 text-white' : 'bg-surface text-ink-800 hover:bg-brand-50'}`}
              >
                {libelle}
              </button>
            ))}
          </div>

          <div className="mt-3"><TableLignes lignes={lignesAffichees} /></div>
          {lignesFiltrees.length > lignesAffichees.length && (
            <div className="mt-3 text-center">
              <Button type="button" variant="secondary" onClick={() => setAfficherTout(true)}>
                Afficher les {lignesFiltrees.length - lignesAffichees.length} autres lignes
              </Button>
            </div>
          )}
        </FormCard>
      )}

      <ConfirmDialog
        open={confirmation}
        tone="primary"
        title="Confirmer l'import"
        confirmLabel={`Importer ${resume?.valides ?? 0} ligne(s)`}
        cancelLabel="Annuler"
        loading={enregistrement}
        onConfirm={importer}
        onCancel={() => !enregistrement && setConfirmation(false)}
        message={resume && (
          `${resume.valides} ligne(s) vont être ajoutées ${apercu?.cible?.type === 'nouvelle' ? 'à une nouvelle déclaration' : `à la déclaration n° ${apercu?.cible?.declaration_id}`}. `
          + `${resume.doublons} doublon(s) seront ignoré(s)`
          + (resume.rejetees > 0 ? ` et ${resume.rejetees} ligne(s) rejetée(s) ne seront pas importées` : '')
          + '. Les lignes existantes ne sont pas modifiées. Confirmer ?'
        )}
      />
    </div>
  )
}

function TableLignes({ lignes }) {
  if (lignes.length === 0) return <p className="py-6 text-center text-sm text-ink-600">Aucune ligne dans cette catégorie.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface text-left text-[14px] font-medium uppercase tracking-wide text-ink-950">
            {['Ligne', 'État', 'FACT NUM', 'IF', 'HT', 'TVA', 'TTC', 'Détail'].map((t) => <th key={t} className="border-b border-line px-3 py-2.5 whitespace-nowrap">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => {
            const v = l.valeurs ?? {}
            const etat = ETATS[l.etat]
            const details = [...(l.erreurs ?? []), ...(l.motif ? [l.motif] : [])]
            return (
              <tr key={l.ligne} className="border-b border-line align-top last:border-0">
                <td className="tabular px-3 py-2 font-semibold">{l.ligne}</td>
                <td className="px-3 py-2"><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${etat.cls}`}>{etat.label}</span></td>
                <td className="px-3 py-2">{v.fact_num ?? ''}</td>
                <td className="px-3 py-2">{v.identifiant_fiscal ?? ''}</td>
                <td className="tabular px-3 py-2 text-right">{v.ht ?? ''}</td>
                <td className="tabular px-3 py-2 text-right">{v.tva ?? ''}</td>
                <td className="tabular px-3 py-2 text-right">{v.ttc ?? ''}</td>
                <td className="px-3 py-2 text-xs">
                  {details.map((d) => <div key={d} className={l.etat === 'rejetee' ? 'text-danger-600' : 'text-warning-700'}>{d}</div>)}
                  {(l.avertissements ?? []).map((a) => <div key={a} className="text-ink-600">⚠ {a}</div>)}
                  {l.etat === 'valide' && (l.avertissements ?? []).length === 0 && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> OK</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
