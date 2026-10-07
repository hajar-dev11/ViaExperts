import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UserRound, Flag, CalendarDays, IdCard, Mail, Phone, MapPin, Users } from 'lucide-react'
import { Field, Input, Select, FormCard } from '../components/Field.jsx'
import Alert from '../components/ui/Alert.jsx'
import { SkeletonText } from '../components/ui/Skeleton.jsx'
import { createClient, updateClient, getClient } from '../api/clients.js'
import { ApiError } from '../api/http.js'

/**
 * Formulaire Client — reproduction de la capture « Nouveau Client » :
 * carte blanche titrée, grille à 2 colonnes, champs à ICÔNE séparée par un
 * filet vertical, et bandeau violet pleine largeur « Ajouter Client » collé au
 * bas de la carte.
 *
 * ⚠️ Champs, validation et appels API strictement inchangés.
 */

const emptyClient = { genre: 'Mr', nom: '', nationalite: 'MAROCAINE', naissance: '', cin: '', email: '', tel: '', tel2: '', adresse: '' }

export default function ClientForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [form, setForm] = useState(emptyClient)
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [globalError, setGlobalError] = useState('')

  useEffect(() => {
    if (!id) return
    getClient(id)
      .then((c) => setForm({ ...emptyClient, ...c }))
      .catch(() => setGlobalError('Impossible de charger ce client.'))
      .finally(() => setLoading(false))
  }, [id])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setErrors({})
    setGlobalError('')
    setSaving(true)
    try {
      if (id) {
        await updateClient(id, form)
      } else {
        await createClient(form)
      }
      navigate('/clients')
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setErrors(err.errors)
      } else {
        setGlobalError("Impossible d'enregistrer ce client. Réessayez.")
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <FormCard title="Modifier Client">
        <SkeletonText lines={8} />
      </FormCard>
    )
  }

  const titre = id ? 'Modifier Client' : 'Nouveau Client'
  const libelleBouton = saving
    ? 'Enregistrement…'
    : id
      ? 'Enregistrer les Modifications'
      : 'Ajouter Client'

  return (
    <form onSubmit={submit}>
      {globalError && <Alert tone="danger" onAutoClose={() => setGlobalError('')} className="mb-4">{globalError}</Alert>}

      <FormCard
        title={titre}
        footer={
          // Bandeau violet pleine largeur collé au bas de la carte,
          // exactement comme le bouton « Ajouter Client » de la référence.
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand-500 py-4 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {libelleBouton}
          </button>
        }
      >
        {/*
          Grille sans case vide : depuis le retrait des champs arabes, chaque
          paire de colonnes regroupe deux champs apparentés — identité,
          identité civile, coordonnées — au lieu de laisser un champ isolé à
          côté d'un espace blanc. Adresse ferme le formulaire en pleine largeur.
        */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Genre" required>
            <Select icon={<Users size={17} />} value={form.genre} onChange={set('genre')}>
              <option>Mr</option>
              <option>Mme</option>
            </Select>
          </Field>
          <Field label="Nationalité">
            <Input icon={<Flag size={17} />} value={form.nationalite} onChange={set('nationalite')} />
          </Field>

          <Field label="Nom Complet" required error={errors.nom?.[0]}>
            <Input
              icon={<UserRound size={17} />}
              required
              placeholder="Nom et prénom"
              value={form.nom}
              onChange={set('nom')}
              error={errors.nom?.[0]}
            />
          </Field>
          <Field label="Date de Naissance">
            <Input
              icon={<CalendarDays size={17} />}
              type="date"
              value={form.naissance ?? ''}
              onChange={set('naissance')}
            />
          </Field>

          <Field label="C.I.N.E" error={errors.cin?.[0]}>
            <Input
              icon={<IdCard size={17} />}
              placeholder="C.I.N.E"
              value={form.cin ?? ''}
              onChange={set('cin')}
              error={errors.cin?.[0]}
            />
          </Field>
          <Field label="Email" error={errors.email?.[0]}>
            <Input
              icon={<Mail size={17} />}
              type="email"
              placeholder="email@exemple.com"
              value={form.email ?? ''}
              onChange={set('email')}
              error={errors.email?.[0]}
            />
          </Field>

          <Field label="Téléphone" error={errors.tel?.[0]}>
            <Input
              icon={<Phone size={17} />}
              placeholder="06 00 00 00 00"
              value={form.tel ?? ''}
              onChange={set('tel')}
              error={errors.tel?.[0]}
            />
          </Field>
          <Field label="Téléphone 2" error={errors.tel2?.[0]}>
            <Input
              icon={<Phone size={17} />}
              placeholder="06 00 00 00 00"
              value={form.tel2 ?? ''}
              onChange={set('tel2')}
              error={errors.tel2?.[0]}
            />
          </Field>

          <Field label="Adresse" className="sm:col-span-2">
            <Input
              icon={<MapPin size={17} />}
              placeholder="Adresse"
              value={form.adresse ?? ''}
              onChange={set('adresse')}
            />
          </Field>
        </div>
      </FormCard>
    </form>
  )
}
