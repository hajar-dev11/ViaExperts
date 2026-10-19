import { useState } from 'react'
import Alert from './ui/Alert.jsx'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import ChampSignature from './ChampSignature.jsx'
import ModePaiementChamp from './ModePaiementChamp.jsx'
import { Field, FileInput, Input, Textarea } from './Field.jsx'
import { ApiError } from '../api/http.js'
import { ajouterComplement } from '../api/paiements.js'
import { aujourdhui } from '../shared/utils/date.js'
import { enNombre } from '../utils/arrondi.js'
import { modePourEnvoi } from '../utils/modePaiement.js'
import { soldeRestant } from '../utils/montants.js'

const n = enNombre
const dh = (v) => `${n(v).toFixed(2)} Dh`

/**
 * « Ajouter un paiement » — paiement COMPLÉMENTAIRE d'un service partiellement réglé (ou pas encore payé), ouvert depuis l'action
 * de la ligne dans « Gestion des Paiements ».
 *
 * Formulaire de la référence : « Prix Restants » (lecture seule, calculé sur TOUTES les opérations déjà enregistrées) · « Prix Payé »
 * (seul montant à saisir) · « Prix Rest » (lecture seule, calculé automatiquement = Prix Restants − Prix Payé).
 * Le montant saisi est positif et au plus égal au reste à payer (contrôlé ici, puis re-contrôlé par le serveur). Il s'ajoute comme
 * une opération distincte : les paiements précédents ne sont jamais modifiés.
 *
 * `ligne` : ligne de la gestion (`paiementId`, `prixRestant`) · `onAjoute(paiement)` · `onClose`.
 */
export default function AjouterPaiementModal({ ligne, onClose, onAjoute }) {
  // Monté seulement quand une ligne est choisie : l'état part toujours d'un formulaire vierge.
  const [form, setForm] = useState({
    prix_paye: '', mode_paiement: '', date_operation: aujourdhui(), signature: false, observation: '',
  })
  const [fichier, setFichier] = useState(null)
  const [erreur, setErreur] = useState('')
  const [erreurs, setErreurs] = useState({})
  const [enCours, setEnCours] = useState(false)

  const restant = n(ligne?.prixRestant)
  const montant = n(form.prix_paye)
  const restantApres = soldeRestant(restant, form.prix_paye)
  const depasse = montant > restant + 0.004

  const set = (cle) => (e) => setForm((f) => ({ ...f, [cle]: e.target.value }))

  const envoyer = async (e) => {
    e.preventDefault()
    setErreur('')
    setErreurs({})
    if (!(montant > 0)) { setErreurs({ prix_paye: ['Saisissez un montant supérieur à 0.'] }); return }
    if (depasse) { setErreurs({ prix_paye: [`Le montant dépasse le reste à payer (${dh(restant)}).`] }); return }

    setEnCours(true)
    try {
      const payload = {
        prix_paye: Number(form.prix_paye),
        date_operation: form.date_operation,
        mode_paiement: modePourEnvoi(form.mode_paiement),
        signature: form.signature,
        observation: form.observation,
      }
      if (fichier) payload.piece_jointe = fichier
      const paiement = await ajouterComplement(ligne.paiementId, payload)
      onAjoute?.(paiement)
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErreurs(err.errors)
      setErreur(err instanceof ApiError ? err.message : "Le paiement n'a pas pu être enregistré.")
    } finally {
      setEnCours(false)
    }
  }

  const messageChamp = (cle) => erreurs[cle]?.[0]

  return (
    <Modal
      open={!!ligne}
      onClose={onClose}
      size="xxl"
      title="Ajouter Un Paiement"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          <Button type="submit" form="form-ajouter-paiement" loading={enCours} disabled={!form.prix_paye}>Ajouter</Button>
        </>
      )}
    >
      <form id="form-ajouter-paiement" onSubmit={envoyer} className="space-y-4">
        {erreur && !Object.keys(erreurs).length && <Alert tone="danger" onClose={() => setErreur('')}>{erreur}</Alert>}

        {/* Prix Restants (avant ce paiement) · Prix Payé (seul champ à saisir) · Prix Rest (calculé automatiquement). */}
        <div className="grid gap-x-5 gap-y-4 md:grid-cols-3">
          <Field label="Prix Restants">
            <Input readOnly value={String(restant)} className="bg-surface text-ink-700" />
          </Field>
          <Field
            label="Prix Payé"
            required
            error={messageChamp('prix_paye') ?? (depasse ? `Dépasse le reste à payer (${dh(restant)}).` : undefined)}
          >
            <Input
              type="number" step="0.01" min="0.01" required autoFocus
              value={form.prix_paye} placeholder="Prix Payé (DH)"
              onChange={(e) => { setErreurs((x) => ({ ...x, prix_paye: undefined })); set('prix_paye')(e) }}
              error={!!messageChamp('prix_paye') || depasse || undefined}
            />
          </Field>
          <Field label="Prix Rest" required>
            <Input readOnly value={restantApres.toFixed(2)} className="bg-surface text-ink-700" />
          </Field>
        </div>

        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
          <ModePaiementChamp value={form.mode_paiement} onChange={(v) => setForm((f) => ({ ...f, mode_paiement: v }))} />
          <Field label="Date d'opération" error={messageChamp('date_operation')}>
            <Input type="date" required value={form.date_operation} onChange={set('date_operation')} />
          </Field>
        </div>

        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
          <ChampSignature
            texte="Ajouter la Signature"
            checked={form.signature}
            onChange={(e) => setForm((f) => ({ ...f, signature: e.target.checked }))}
          />
          <Field label="pièce à jointe" error={messageChamp('piece_jointe')}>
            <FileInput onChange={(e) => setFichier(e.target.files?.[0] || null)} />
          </Field>
        </div>

        <Field label="Observation" error={messageChamp('observation')}>
          <Textarea rows={5} value={form.observation} onChange={set('observation')} className="min-h-[8.5rem]" />
        </Field>
      </form>
    </Modal>
  )
}
