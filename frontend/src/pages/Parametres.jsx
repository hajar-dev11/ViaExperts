import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { UserRound, Save, LifeBuoy, Mail as MailIcon, Stamp, Briefcase, Building2, MapPinned, ShieldCheck, Pencil, X, ShieldAlert, Trash2, Image as ImageIcon } from 'lucide-react'
import { Field, Input, Select, Textarea, Checkbox, FormCard } from '../components/Field.jsx'
import DataTable from '../components/DataTable.jsx'
import ServerTable from '../components/ServerTable.jsx'
import Alert from '../components/ui/Alert.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { RowBtn } from '../components/ListToolbar.jsx'
import Button, { IconButton } from '../components/ui/Button.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import {
  listUsers,
  createUser,
  updateUser,
  listPermissions,
  getUserPermissions,
  updateUserPermissions,
} from '../api/users.js'
import {
  getCabinetSettings,
  updateCabinetSettings,
  uploadCabinetLogo,
  resetCabinetLogo,
  uploadCabinetSignature,
  resetCabinetSignature,
  getDomiciliationSettings,
  updateDomiciliationSettings,
  uploadDomiciliationLogo,
  resetDomiciliationLogo,
  uploadDomiciliationSignature,
  resetDomiciliationSignature,
} from '../api/settings.js'
import { DomiciliationCentres } from '../modules/domiciliation/index.js'
import { serviceStatusApi, cachetStatusApi, mailStatusApi } from '../api/statuses.js'
import { ApiError, API_URL } from '../api/http.js'

const TABS = [
  { key: 'compte', label: 'Paramètre Compte', icon: UserRound },
  { key: 'bureau', label: 'Bureau de Comptabilité', icon: Briefcase },
  { key: 'centre', label: 'Centre Domiciliation', icon: MapPinned },
  { key: 'services', label: 'Services', icon: Building2 },
  { key: 'cachet', label: 'Cachet', icon: Stamp },
  { key: 'mail', label: 'Mail', icon: MailIcon },
  { key: 'assistance', label: 'Assistance', icon: LifeBuoy },
]

function RestrictedCard() {
  return (
    <FormCard>
      <div className="flex flex-col items-center justify-center text-center gap-2 py-10 text-ink-600">
        <ShieldAlert size={28} />
        <span className="text-sm font-medium text-ink-700">Section réservée à l'administrateur.</span>
      </div>
    </FormCard>
  )
}

function AccountTab() {
  const { user, updateProfile, uploadPhoto, deletePhoto } = useAuth()
  const [subTab, setSubTab] = useState('profil')
  const photoInputRef = useRef(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  const [profileForm, setProfileForm] = useState({ name: '', email: '', telephone: '' })
  const [profileErrors, setProfileErrors] = useState({})
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError] = useState('')

  const [passwordForm, setPasswordForm] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    if (user) setProfileForm({ name: user.name ?? '', email: user.email ?? '', telephone: user.telephone ?? '' })
  }, [user])

  const saveProfile = async (e) => {
    e.preventDefault()
    setProfileSaving(true)
    setProfileError('')
    setProfileErrors({})
    setProfileSuccess('')
    try {
      await updateProfile({ name: profileForm.name, email: profileForm.email, telephone: profileForm.telephone || null })
      setProfileSuccess('Profil mis à jour avec succès.')
    } catch (err) {
      if (err instanceof ApiError && err.errors) setProfileErrors(err.errors)
      setProfileError(apiErrorMessage(err))
    } finally {
      setProfileSaving(false)
    }
  }

  const handlePhotoUpload = async (file) => {
    setPhotoBusy(true)
    setProfileError('')
    setProfileSuccess('')
    try {
      await uploadPhoto(file)
      setProfileSuccess('Photo de profil mise à jour.')
    } catch (err) {
      setProfileError(apiErrorMessage(err))
    } finally {
      setPhotoBusy(false)
    }
  }

  const handlePhotoReset = async () => {
    setPhotoBusy(true)
    setProfileError('')
    setProfileSuccess('')
    try {
      await deletePhoto()
      setProfileSuccess('Photo de profil supprimée.')
    } catch (err) {
      setProfileError(apiErrorMessage(err))
    } finally {
      setPhotoBusy(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    setPasswordSaving(true)
    setPasswordError('')
    setPasswordErrors({})
    setPasswordSuccess('')
    try {
      await updateProfile({
        name: user.name,
        email: user.email,
        telephone: user.telephone,
        current_password: passwordForm.current_password,
        password: passwordForm.password,
        password_confirmation: passwordForm.password_confirmation,
      })
      setPasswordSuccess('Mot de passe mis à jour avec succès.')
      setPasswordForm({ current_password: '', password: '', password_confirmation: '' })
    } catch (err) {
      if (err instanceof ApiError && err.errors) setPasswordErrors(err.errors)
      setPasswordError(apiErrorMessage(err))
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <FormCard title="Paramètre Compte">
      <div className="flex gap-2 mb-6">
        {['profil', 'securite'].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              subTab === t ? 'bg-brand-600 text-white' : 'bg-surface text-ink-700 hover:bg-line/40'
            }`}
          >
            {t === 'profil' ? <UserRound size={15} /> : <ShieldCheck size={15} />}
            {t === 'profil' ? 'Profil' : 'Sécurité'}
          </button>
        ))}
      </div>

      {subTab === 'profil' ? (
        <form onSubmit={saveProfile} className="max-w-xl space-y-5">
          {profileError && <Alert tone="danger" onAutoClose={() => setProfileError('')}>{profileError}</Alert>}
          {profileSuccess && <Alert tone="success" onAutoClose={() => setProfileSuccess('')}>{profileSuccess}</Alert>}
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-surface grid place-items-center text-ink-600 overflow-hidden shrink-0">
              {user?.photo_path
                ? <img src={logoUrl(user.photo_path)} alt="" className="h-full w-full object-cover" />
                : <UserRound size={30} />}
            </div>
            <div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => photoInputRef.current?.click()}
                  loading={photoBusy}
                >
                  {photoBusy ? 'Envoi…' : 'Upload new photo'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handlePhotoReset}
                  disabled={!user?.photo_path || photoBusy}
                >
                  Reset
                </Button>
              </div>
              <p className="text-xs text-ink-600 mt-1.5">Allowed JPG, GIF ou PNG. Max size of 800K.</p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handlePhotoUpload(f)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
          <Field label="Nom et Prénom" required>
            <Input required value={profileForm.name} onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nom et prénom" />
            {profileErrors.name && <span className="mt-1 block text-xs text-danger-600">{profileErrors.name[0]}</span>}
          </Field>
          <Field label="Email" required>
            <Input type="email" required value={profileForm.email} onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@exemple.com" />
            {profileErrors.email && <span className="mt-1 block text-xs text-danger-600">{profileErrors.email[0]}</span>}
          </Field>
          <Field label="Téléphone">
            <Input value={profileForm.telephone} onChange={(e) => setProfileForm((f) => ({ ...f, telephone: e.target.value }))} placeholder="+212 6 00 00 00 00" />
          </Field>
          <Button type="submit" variant="primary" icon={<Save size={15} />} loading={profileSaving}>
            {profileSaving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
      ) : (
        <form onSubmit={savePassword} className="max-w-xl space-y-5">
          {passwordError && <Alert tone="danger" onAutoClose={() => setPasswordError('')}>{passwordError}</Alert>}
          {passwordSuccess && <Alert tone="success" onAutoClose={() => setPasswordSuccess('')}>{passwordSuccess}</Alert>}
          <Field label="Mot de passe actuel" required>
            <Input
              type="password"
              required
              value={passwordForm.current_password}
              onChange={(e) => setPasswordForm((f) => ({ ...f, current_password: e.target.value }))}
              placeholder="••••••••"
            />
            {passwordErrors.current_password && <span className="mt-1 block text-xs text-danger-600">{passwordErrors.current_password[0]}</span>}
          </Field>
          <Field label="Nouveau mot de passe" required>
            <Input
              type="password"
              required
              minLength={8}
              value={passwordForm.password}
              onChange={(e) => setPasswordForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
            />
            {passwordErrors.password && <span className="mt-1 block text-xs text-danger-600">{passwordErrors.password[0]}</span>}
          </Field>
          <Field label="Confirmer le mot de passe" required>
            <Input
              type="password"
              required
              value={passwordForm.password_confirmation}
              onChange={(e) => setPasswordForm((f) => ({ ...f, password_confirmation: e.target.value }))}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" variant="primary" icon={<Save size={15} />} loading={passwordSaving}>
            {passwordSaving ? 'Mise à jour…' : 'Mettre à jour'}
          </Button>
        </form>
      )}
    </FormCard>
  )
}

const FONCTIONS = ['Assistant', 'Comptable', 'Autre']

// Groupes, ordre et intitulés de la maquette de référence (permissions_assistance.json).
// Doit rester aligné sur Database\Seeders\PermissionSeeder::CATALOGUE : une action listée ici
// n'apparaît que si elle existe réellement dans la table `permissions` du backend.
// Les clés d'action de clients/entreprises restent celles du backend (create/update/delete) ;
// seuls les libellés affichés suivent la maquette.
const PERMISSION_GROUPS = [
  {
    module: 'clients',
    label: 'Accès Au Client',
    actions: {
      list: 'List',
      create: 'Ajouter',
      update: 'Modifier',
      archive: 'Archive',
      corbeille: 'Corbeille',
      delete: 'Supprimer',
      add_observation: 'Ajouter Observation',
      add_document: 'Ajouter Document',
    },
  },
  {
    module: 'entreprises',
    label: 'Accès Au Entreprise',
    actions: {
      list: 'List',
      create: 'Ajouter',
      update: 'Modifier',
      archive: 'Archive',
      corbeille: 'Corbeille',
      delete: 'Supprimer',
      add_observation: 'Ajouter Observation',
      add_document: 'Ajouter Document',
      liste_noire: 'Liste Noire',
      bloquer: 'Bloquer',
    },
  },
  {
    module: 'domiciliation',
    label: 'Accès Au Domiciliation',
    actions: {
      ajouter: 'Ajouter',
      renouveler: 'Renouveler',
      facture: 'Facture',
      contrat: 'Contrat',
      attestation: 'Attestation',
      procuration: 'Procuration',
      resilier: 'Resilier',
      corbeille: 'Corbeille',
      archive: 'Archive',
      supprimer: 'Supprimer',
      list: 'List',
      gestion: 'Gestion',
      calendrier: 'Calendrier',
      centres_list: 'Centres List',
      ajouter_centres: 'Ajouter Centres',
      modifier_centres: 'Modifier Centres',
      export_list: 'Export List',
    },
  },
  {
    module: 'services',
    label: 'Accès Au Services',
    actions: {
      ajouter: 'Ajouter',
      modifier: 'Modifier',
      archive: 'Archive',
      corbeille: 'Corbeille',
      supprimer: 'Supprimer',
      list: 'List',
    },
  },
  {
    module: 'services_en_cours',
    label: 'Accès Au Services En Cours',
    actions: {
      ajouter: 'Ajouter',
      modifier: 'Modifier',
      archive: 'Archive',
      corbeille: 'Corbeille',
      supprimer: 'Supprimer',
      list: 'List',
    },
  },
  {
    module: 'facturation',
    label: 'Accès Au Facturation',
    actions: {
      ajouter_facture: 'Ajouter Facture',
      ajouter_devis: 'Ajouter Devis',
      ajouter_bon_livraison: 'Ajouter Bon Livraison',
      ajouter_facture_avoir: "Ajouter Facture d'avoir",
      liste_facture: 'Liste Facture',
      liste_devis: 'Liste Devis',
      liste_bon_livraison: 'Liste Bon Livraison',
      liste_facture_avoir: "Liste Facture d'avoir",
      ajouter_centre_domiciliation_facture: 'Ajouter Centre Domiciliation Facture',
      ajouter_centre_domiciliation_devis: 'Ajouter Centre Domiciliation Devis',
      ajouter_centre_domiciliation_bon_livraison: 'Ajouter Centre Domiciliation Bon Livraison',
      ajouter_centre_domiciliation_facture_avoir: "Ajouter Centre Domiciliation Facture d'avoir",
      ajouter_bureau_comptabilite_facture: 'Ajouter Bureau de Comptabilité Facture',
      ajouter_bureau_comptabilite_devis: 'Ajouter Bureau de Comptabilité Devis',
      ajouter_bureau_comptabilite_bon_livraison: 'Ajouter Bureau de Comptabilité Bon Livraison',
      ajouter_bureau_comptabilite_facture_avoir: "Ajouter Bureau de Comptabilité Facture d'avoir",
      exporter_list_facture: 'Exporter List Facture',
      exporter_list_devis: 'Exporter List Devis',
      exporter_list_bon_livraison: 'Exporter List Bon Livraison',
      exporter_list_facture_avoir: "Exporter List Facture d'avoir",
      archive_facture: 'Archive Facture',
      archive_devis: 'Archive Devis',
      archive_bon_livraison: 'Archive Bon Livraison',
      archive_facture_avoir: "Archive Facture d'avoir",
      corbeille_facture: 'Corbeille Facture',
      corbeille_devis: 'Corbeille Devis',
      corbeille_bon_livraison: 'Corbeille Bon Livraison',
      corbeille_facture_avoir: "Corbeille Facture d'avoir",
      supprimer_facture: 'Supprimer Facture',
      supprimer_devis: 'Supprimer Devis',
      supprimer_bon_livraison: 'Supprimer Bon Livraison',
      supprimer_facture_avoir: "Supprimer Facture d'avoir",
    },
  },
  {
    module: 'paiements',
    label: 'Accès Au Paiements',
    actions: {
      ajouter_paiement: 'Ajouter Paiement',
      ajouter_centre_domiciliation_paiement: 'Ajouter Centre Domiciliation Paiement',
      ajouter_bureau_comptabilite_paiement: 'Ajouter Bureau de Comptabilité Paiement',
      modifier_date_credits: 'Modifier Date Crédits',
      gestion_paiements: 'Gestion des Paiements',
      list_paiements: 'List Des Paiements',
      exporter: 'Exporter',
      archive: 'Archive',
      corbeille: 'Corbeille',
      supprimer: 'Supprimer',
    },
  },
  {
    module: 'mouvement',
    label: 'Accès Au Mouvement',
    actions: {
      mouvement_entres_recu: 'Mouvement Entrés (Reçu)',
      mouvement_entres_facture: 'Mouvement Entrés (Facture)',
    },
  },
  {
    module: 'declaration',
    label: 'Accès Au Declaration',
    actions: {
      ajouter: 'Ajouter',
      modifier: 'Modifier',
      importeur: 'Importeur',
      liste: 'Liste',
      sauvegarder_non_declare: 'Sauvegarder (Non Déclaré)',
      sauvegarder_declaree: 'Sauvegarder (Déclarée)',
      exporter_zip: 'Exporter ZIP',
      exporter_xml: 'Exporter XML',
      exporter_excel: 'Exporter Excel',
      exporter_list: 'Exporter List',
      archive: 'Archive',
      corbeille: 'Corbeille',
      supprimer: 'Supprimer',
    },
  },
  {
    module: 'cashet',
    label: 'Accès Au Les Cashet',
    actions: {
      list: 'List',
      ajouter: 'Ajouter',
      modifier: 'Modifier',
      archive: 'Archive',
      corbeille: 'Corbeille',
      supprimer: 'Supprimer',
    },
  },
  {
    module: 'mails',
    label: 'Accès Au Les Mails',
    actions: {
      list: 'List',
      ajouter: 'Ajouter',
      modifier: 'Modifier',
      archive: 'Archive',
      corbeille: 'Corbeille',
      supprimer: 'Supprimer',
    },
  },
  {
    module: 'data_center',
    label: 'Accès Au Data Center',
    actions: {
      list: 'List',
      ajouter: 'Ajouter',
      modifier: 'Modifier',
      archive: 'Archive',
      corbeille: 'Corbeille',
      supprimer: 'Supprimer',
    },
  },
  {
    module: 'chiffre_affaire',
    label: "Accès Au Chiffre d'Affaire",
    actions: {
      ajouter: 'Ajouter',
      modifier: 'Modifier',
      liste: 'Liste',
      sauvegarder_non_declare: 'Sauvegarder (Non Déclaré)',
      sauvegarder_declaree: 'Sauvegarder (Déclarée)',
      exporter_excel: 'Exporter Excel',
      exporter_list: 'Exporter List',
      archive: 'Archive',
      corbeille: 'Corbeille',
      supprimer: 'Supprimer',
    },
  },
  {
    module: 'parametre',
    label: 'Accès Au Parametre',
    actions: {
      account: 'Account',
      mot_de_passe: 'Mot de Passe',
      bureau_comptabilite: 'Bureau de Comptabilité',
      centre_domiciliation: 'Centre Domiciliation',
      ajouter_services_status: 'Ajouter Services Status',
      ajouter_cashet_status: 'Ajouter Cashet Status',
      ajouter_mail_status: 'Ajouter Mail Status',
      ajouter_assistance: 'Ajouter Assistance',
    },
  },
]

const GROUP_BY_MODULE = Object.fromEntries(PERMISSION_GROUPS.map((g) => [g.module, g]))
const MODULE_ORDER = PERMISSION_GROUPS.map((g) => g.module)

// `account` (gestion des comptes utilisateurs), `mot_de_passe` (changer le mot de passe
// d'un AUTRE utilisateur) et `ajouter_assistance` (voir/modifier les permissions d'autrui)
// restent strictement réservées à l'administrateur : le backend les garde derrière le
// middleware `admin` (jamais `permission:parametre,...`), donc les accorder via cette
// grille n'aurait de toute façon aucun effet — on ne les affiche pas pour éviter une
// case à cocher trompeuse qui laisserait croire qu'elles sont délégables.
const ADMIN_ONLY_ACTIONS = { parametre: new Set(['account', 'mot_de_passe', 'ajouter_assistance']) }

// Un module/une action inconnu(e) du catalogue frontend reste affiché(e), en fin de liste,
// avec sa clé brute : rien de ce que renvoie l'API n'est masqué silencieusement.
const rank = (list, key) => {
  const i = list.indexOf(key)
  return i === -1 ? list.length : i
}
const moduleLabel = (mod) => GROUP_BY_MODULE[mod]?.label || mod
const actionLabel = (mod, action) => GROUP_BY_MODULE[mod]?.actions?.[action] || action
const actionRank = (mod, action) => rank(Object.keys(GROUP_BY_MODULE[mod]?.actions || {}), action)

function apiErrorMessage(err) {
  if (err instanceof ApiError) {
    const firstFieldError = err.errors && Object.values(err.errors)[0]?.[0]
    return firstFieldError || err.message
  }
  return "Une erreur est survenue."
}

const emptyForm = { name: '', telephone: '', email: '', password: '', fonction: '' }

function AssistanceTab() {
  const { user } = useAuth()
  const isAdmin = !!user?.is_admin

  const [users, setUsers] = useState([])
  const [permCatalog, setPermCatalog] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  const [checkedPermissions, setCheckedPermissions] = useState(new Set())
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadUsers = () => {
    setLoadingList(true)
    setError('')
    listUsers()
      .then(setUsers)
      .catch(() => setError('Impossible de charger la liste des utilisateurs.'))
      .finally(() => setLoadingList(false))
  }

  useEffect(() => {
    if (!isAdmin) return
    loadUsers()
    listPermissions()
      .then(setPermCatalog)
      .catch(() => setError('Impossible de charger le catalogue des permissions.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  if (!isAdmin) {
    return <RestrictedCard />
  }

  const modules = [...new Set(permCatalog.map((p) => p.module))].sort(
    (a, b) => rank(MODULE_ORDER, a) - rank(MODULE_ORDER, b),
  )

  const openCreate = () => {
    setEditingUser(null)
    setForm(emptyForm)
    setFormErrors({})
    setCheckedPermissions(new Set())
    setSuccess('')
    setError('')
  }

  const openEdit = (u) => {
    setEditingUser(u)
    setForm({ name: u.name ?? '', telephone: u.telephone ?? '', email: u.email ?? '', password: '', fonction: u.fonction ?? '' })
    setFormErrors({})
    setSuccess('')
    setError('')
    setCheckedPermissions(new Set())
    setLoadingPermissions(true)
    getUserPermissions(u.id)
      .then((rows) => setCheckedPermissions(new Set(rows.map((r) => r.permissionId))))
      .catch(() => setError("Impossible de charger les permissions de cet utilisateur."))
      .finally(() => setLoadingPermissions(false))
  }

  const togglePermission = (id) => {
    setCheckedPermissions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFormErrors({})

    const payload = {
      name: form.name,
      telephone: form.telephone || null,
      email: form.email,
      fonction: form.fonction || null,
    }
    if (form.password) payload.password = form.password

    try {
      if (editingUser) {
        await updateUser(editingUser.id, payload)
        await updateUserPermissions(editingUser.id, Array.from(checkedPermissions))
        setSuccess('Utilisateur mis à jour avec succès.')
      } else {
        await createUser({ ...payload, permissions: Array.from(checkedPermissions) })
        setSuccess('Utilisateur créé avec succès.')
      }
      setEditingUser(null)
      setForm(emptyForm)
      setCheckedPermissions(new Set())
      loadUsers()
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFormErrors(err.errors)
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Accès rapide à la gestion des centres de domiciliation (ajouter / modifier /
          mettre à la corbeille) : on renvoie vers la page existante plutôt que de
          dupliquer son formulaire et sa logique ici. */}
      <div className="flex justify-end">
        <Button variant="secondary" icon={<MapPinned size={15} />} to="/domiciliation/centres">
          Gérer les Centres de Domiciliation
        </Button>
      </div>

      {error && <Alert tone="danger" onAutoClose={() => setError('')}>{error}</Alert>}
      {success && <Alert tone="success" onAutoClose={() => setSuccess('')}>{success}</Alert>}

      <FormCard
        title={editingUser ? `Modifier ${editingUser.name}` : 'Ajouter Assistance'}
        action={editingUser && (
          <IconButton variant="ghost" size="sm" onClick={openCreate} title="Annuler la modification">
            <X size={18} />
          </IconButton>
        )}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Nom de l'Assistance" required>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nom de l'Assistance"
              />
              {formErrors.name && <span className="mt-1 block text-xs text-danger-600">{formErrors.name[0]}</span>}
            </Field>
            <Field label="Téléphone">
              <Input
                value={form.telephone}
                onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                placeholder="06 06 06 06 06"
              />
            </Field>
            <Field label="E-mail" required>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@E-mail.com"
              />
              {formErrors.email && <span className="mt-1 block text-xs text-danger-600">{formErrors.email[0]}</span>}
            </Field>
            <Field label={editingUser ? 'Mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe'} required={!editingUser}>
              <Input
                type="password"
                required={!editingUser}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="•••••••••"
              />
              {formErrors.password && <span className="mt-1 block text-xs text-danger-600">{formErrors.password[0]}</span>}
            </Field>
            <Field label="Fonction">
              <Select value={form.fonction} onChange={(e) => setForm((f) => ({ ...f, fonction: e.target.value }))}>
                <option value="">—</option>
                {FONCTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            {loadingPermissions ? (
              <div className="py-4 text-center text-sm text-ink-600">Chargement des permissions…</div>
            ) : (
              <div className="space-y-8">
                {modules.map((mod) => {
                  const actions = permCatalog
                    .filter((p) => p.module === mod && !ADMIN_ONLY_ACTIONS[mod]?.has(p.action))
                    .sort((a, b) => actionRank(mod, a.action) - actionRank(mod, b.action))
                  const moduleIds = actions.map((p) => p.id)
                  const allChecked = moduleIds.length > 0 && moduleIds.every((id) => checkedPermissions.has(id))
                  const toggleModuleAll = () => {
                    setCheckedPermissions((prev) => {
                      const next = new Set(prev)
                      moduleIds.forEach((id) => (allChecked ? next.delete(id) : next.add(id)))
                      return next
                    })
                  }
                  return (
                    <div key={mod}>
                      <div className="flex items-center gap-3 mb-5">
                        <span className="h-px flex-1 bg-brand-200" />
                        <span className="text-sm font-semibold text-ink-800">{moduleLabel(mod)}</span>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-ink-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={toggleModuleAll}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500/40"
                          />
                          Tout sélectionner
                        </label>
                        <span className="h-px flex-1 bg-brand-200" />
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5">
                        {actions.map((p) => {
                          const label = actionLabel(mod, p.action)
                          const checked = checkedPermissions.has(p.id)
                          return (
                            <div key={p.id}>
                              <span className="mb-1.5 block text-xs text-slate-500">{label}</span>
                              <label
                                className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm cursor-pointer transition-colors ${
                                  checked ? 'border-brand-400 bg-brand-50/60 text-ink-900' : 'border-slate-200 text-ink-800 hover:bg-slate-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePermission(p.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/40"
                                />
                                {label}
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            {editingUser && (
              <Button type="button" variant="secondary" onClick={openCreate}>
                Annuler
              </Button>
            )}
            <Button type="submit" variant="primary" icon={<Save size={15} />} loading={saving}>
              {saving ? 'Enregistrement…' : editingUser ? 'Enregistrer' : 'Ajouter Assistance'}
            </Button>
          </div>
        </form>
      </FormCard>

      <FormCard title="Liste des Assistants">
        {loadingList ? (
          <div className="py-10 text-center text-sm text-ink-600">Chargement…</div>
        ) : (
          <DataTable
            columns={[
              { key: 'name', header: 'Nom Complet', render: (r) => <span className="font-semibold text-brand-700">{r.name}</span> },
              { key: 'email', header: 'Email' },
              { key: 'telephone', header: 'Téléphone', render: (r) => r.telephone || '—' },
              { key: 'fonction', header: 'Fonction', render: (r) => r.fonction || '—' },
              {
                key: 'isAdmin',
                header: 'Rôle',
                render: (r) => (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${r.isAdmin ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                    {r.isAdmin ? 'Administrateur' : 'Staff'}
                  </span>
                ),
              },
            ]}
            rows={users}
            emptyText="Aucun utilisateur"
            actionsHeader="Actions"
            rowActions={(r) => (
              <div className="flex justify-end">
                <RowBtn title="Modifier" onClick={() => openEdit(r)}><Pencil size={14} /></RowBtn>
              </div>
            )}
          />
        )}
      </FormCard>
    </div>
  )
}

function NumberingRow({ label, prefixValue, numberValue, suffixValue, onPrefix, onNumber, onSuffix }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        <Input value={prefixValue ?? ''} onChange={onPrefix} placeholder="Préfixe" />
        <Input type="number" value={numberValue ?? ''} onChange={onNumber} placeholder="N°" />
        <Input value={suffixValue ?? ''} onChange={onSuffix} placeholder="Suffixe" />
      </div>
    </div>
  )
}

function logoUrl(path) {
  return path ? `${API_URL}/storage/${path}` : null
}

function LogoSignatureField({ buttonLabel, imageUrl, onUpload, onReset, uploading }) {
  const inputRef = useRef(null)
  return (
    <div className="flex items-start gap-4">
      <div className="h-20 w-20 rounded-lg border border-line bg-surface grid place-items-center overflow-hidden shrink-0">
        {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-contain" /> : <ImageIcon size={22} className="text-ink-600" />}
      </div>
      <div>
        <div className="flex gap-2">
          <Button type="button" variant="primary" onClick={() => inputRef.current?.click()} loading={uploading}>
            {uploading ? 'Envoi…' : buttonLabel}
          </Button>
          <Button type="button" variant="secondary" onClick={onReset} disabled={!imageUrl || uploading}>
            Reset
          </Button>
        </div>
        <p className="text-xs text-ink-600 mt-1.5">JPG, GIF ou PNG autorisés. Taille maximale de 800 Ko.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

function BureauTab() {
  const { hasPermission } = useAuth()
  const canAccess = hasPermission('parametre', 'bureau_comptabilite')

  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingSignature, setUploadingSignature] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const reload = () => {
    setForm(null)
    getCabinetSettings().then(setForm).catch(() => setError('Impossible de charger les paramètres du bureau de comptabilité.'))
  }

  useEffect(() => {
    if (!canAccess) return
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess])

  if (!canAccess) return <RestrictedCard />
  if (!form) {
    return (
      <FormCard>
        {error ? <Alert tone="danger">{error}</Alert> : (
          <div className="py-10 text-center text-sm text-ink-600">Chargement…</div>
        )}
      </FormCard>
    )
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setNumber = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value === '' ? null : Number(e.target.value) }))
  const setChecked = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.checked }))

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const updated = await updateCabinetSettings(form)
      setForm(updated)
      setSuccess('Paramètres enregistrés avec succès.')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleUploadLogo = async (file) => {
    setUploadingLogo(true)
    setError('')
    try {
      setForm(await uploadCabinetLogo(file))
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleResetLogo = async () => {
    setUploadingLogo(true)
    setError('')
    try {
      setForm(await resetCabinetLogo())
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleUploadSignature = async (file) => {
    setUploadingSignature(true)
    setError('')
    try {
      setForm(await uploadCabinetSignature(file))
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploadingSignature(false)
    }
  }

  const handleResetSignature = async () => {
    setUploadingSignature(true)
    setError('')
    try {
      setForm(await resetCabinetSignature())
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploadingSignature(false)
    }
  }

  return (
    <FormCard title="Bureau de Comptabilité">
      <form onSubmit={save} className="space-y-6">
        {error && <Alert tone="danger" onAutoClose={() => setError('')}>{error}</Alert>}
        {success && <Alert tone="success" onAutoClose={() => setSuccess('')}>{success}</Alert>}

        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl">
          <LogoSignatureField buttonLabel="Choisir le Logo" imageUrl={logoUrl(form.logo_path)} uploading={uploadingLogo} onUpload={handleUploadLogo} onReset={handleResetLogo} />
          <LogoSignatureField buttonLabel="Choisir le Signature" imageUrl={logoUrl(form.signature_path)} uploading={uploadingSignature} onUpload={handleUploadSignature} onReset={handleResetSignature} />
        </div>

        <Field label="Nom de Société" className="max-w-3xl">
          <Input value={form.nom_societe ?? ''} onChange={set('nom_societe')} placeholder="Nom du bureau de comptabilité" />
        </Field>

        <div className="grid sm:grid-cols-3 gap-5 max-w-3xl">
          <Field label="References de Recu">
            <Input value={form.references_recu ?? ''} onChange={set('references_recu')} placeholder="905" />
          </Field>
          <Field label="Afficher Entreprise Info Sur Recu">
            <div className="flex h-[42px] items-center rounded-lg border border-slate-200 bg-slate-50/60 px-3.5">
              <Checkbox label="Afficher Entreprise Info" checked={!!form.afficher_entreprise_info_recu} onChange={setChecked('afficher_entreprise_info_recu')} />
            </div>
          </Field>
          <Field label="ICE de Société">
            <Input value={form.ice_societe ?? ''} onChange={set('ice_societe')} placeholder="ICE" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl items-start">
          <div className="space-y-5">
            <NumberingRow
              label="Numérotation des Factures"
              prefixValue={form.facture_prefixe} numberValue={form.facture_prochain_numero} suffixValue={form.facture_suffixe}
              onPrefix={set('facture_prefixe')} onNumber={setNumber('facture_prochain_numero')} onSuffix={set('facture_suffixe')}
            />
            <NumberingRow
              label="Numérotation des Devis"
              prefixValue={form.devis_prefixe} numberValue={form.devis_prochain_numero} suffixValue={form.devis_suffixe}
              onPrefix={set('devis_prefixe')} onNumber={setNumber('devis_prochain_numero')} onSuffix={set('devis_suffixe')}
            />
            <NumberingRow
              label="Numérotation des Bons de Livraison"
              prefixValue={form.bl_prefixe} numberValue={form.bl_prochain_numero} suffixValue={form.bl_suffixe}
              onPrefix={set('bl_prefixe')} onNumber={setNumber('bl_prochain_numero')} onSuffix={set('bl_suffixe')}
            />
            <NumberingRow
              label="Numérotation des Facture d'avoir"
              prefixValue={form.avoir_prefixe} numberValue={form.avoir_prochain_numero} suffixValue={form.avoir_suffixe}
              onPrefix={set('avoir_prefixe')} onNumber={setNumber('avoir_prochain_numero')} onSuffix={set('avoir_suffixe')}
            />
          </div>
          <Field label="Entreprise Info" className="h-full">
            <Textarea value={form.entreprise_info ?? ''} onChange={set('entreprise_info')} placeholder="Adresse, ICE, RC, IF, email, téléphone, site web..." className="min-h-[280px] h-full" />
          </Field>
        </div>

        <div className="flex gap-3">
          <Button type="submit" variant="primary" icon={<Save size={15} />} loading={saving}>
            {saving ? 'Enregistrement…' : 'Save changes'}
          </Button>
          <Button type="button" variant="secondary" onClick={reload}>
            Cancel
          </Button>
        </div>
      </form>
    </FormCard>
  )
}

function CentreSettingsForm() {
  const { hasPermission } = useAuth()
  const canAccess = hasPermission('parametre', 'centre_domiciliation')

  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingSignature, setUploadingSignature] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const reload = () => {
    setForm(null)
    getDomiciliationSettings().then(setForm).catch(() => setError('Impossible de charger les paramètres du centre de domiciliation.'))
  }

  useEffect(() => {
    if (!canAccess) return
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess])

  if (!canAccess) return <RestrictedCard />
  if (!form) {
    return (
      <FormCard>
        {error ? <Alert tone="danger">{error}</Alert> : (
          <div className="py-10 text-center text-sm text-ink-600">Chargement…</div>
        )}
      </FormCard>
    )
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setNumber = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value === '' ? null : Number(e.target.value) }))
  const setChecked = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.checked }))

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const updated = await updateDomiciliationSettings(form)
      setForm(updated)
      setSuccess('Paramètres enregistrés avec succès.')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleUploadLogo = async (file) => {
    setUploadingLogo(true)
    setError('')
    try {
      setForm(await uploadDomiciliationLogo(file))
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleResetLogo = async () => {
    setUploadingLogo(true)
    setError('')
    try {
      setForm(await resetDomiciliationLogo())
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleUploadSignature = async (file) => {
    setUploadingSignature(true)
    setError('')
    try {
      setForm(await uploadDomiciliationSignature(file))
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploadingSignature(false)
    }
  }

  const handleResetSignature = async () => {
    setUploadingSignature(true)
    setError('')
    try {
      setForm(await resetDomiciliationSignature())
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploadingSignature(false)
    }
  }

  return (
    <FormCard title="Centre Domiciliation">
      <form onSubmit={save} className="space-y-6">
        {error && <Alert tone="danger" onAutoClose={() => setError('')}>{error}</Alert>}
        {success && <Alert tone="success" onAutoClose={() => setSuccess('')}>{success}</Alert>}

        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl">
          <LogoSignatureField buttonLabel="Choisir le Logo" imageUrl={logoUrl(form.logo_path)} uploading={uploadingLogo} onUpload={handleUploadLogo} onReset={handleResetLogo} />
          <LogoSignatureField buttonLabel="Choisir le Signature" imageUrl={logoUrl(form.signature_path)} uploading={uploadingSignature} onUpload={handleUploadSignature} onReset={handleResetSignature} />
        </div>

        <div className="grid sm:grid-cols-2 gap-5 max-w-3xl">
          <Field label="Nom de Société">
            <Input value={form.nom_societe ?? ''} onChange={set('nom_societe')} placeholder="Nom de la société de domiciliation" />
          </Field>
          <Field label="Gérant">
            <Input value={form.gerant ?? ''} onChange={set('gerant')} placeholder="Nom du gérant" />
          </Field>
        </div>

        <Field label="Prix de Domiciliation" className="max-w-3xl">
          <Input type="number" step="0.01" value={form.prix_domiciliation ?? ''} onChange={setNumber('prix_domiciliation')} placeholder="0.00" />
        </Field>

        <div className="grid sm:grid-cols-3 gap-5 max-w-3xl">
          <Field label="References de Recu">
            <Input value={form.references_recu ?? ''} onChange={set('references_recu')} placeholder="1020" />
          </Field>
          <Field label="Afficher Entreprise Info Sur Recu">
            <div className="flex h-[42px] items-center rounded-lg border border-slate-200 bg-slate-50/60 px-3.5">
              <Checkbox label="Afficher Entreprise Info" checked={!!form.afficher_entreprise_info_recu} onChange={setChecked('afficher_entreprise_info_recu')} />
            </div>
          </Field>
          <Field label="ICE de Société">
            <Input value={form.ice_societe ?? ''} onChange={set('ice_societe')} placeholder="ICE" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl items-start">
          <div className="space-y-5">
            <NumberingRow
              label="Numérotation des Factures"
              prefixValue={form.facture_prefixe} numberValue={form.facture_prochain_numero} suffixValue={form.facture_suffixe}
              onPrefix={set('facture_prefixe')} onNumber={setNumber('facture_prochain_numero')} onSuffix={set('facture_suffixe')}
            />
            <NumberingRow
              label="Numérotation des Devis"
              prefixValue={form.devis_prefixe} numberValue={form.devis_prochain_numero} suffixValue={form.devis_suffixe}
              onPrefix={set('devis_prefixe')} onNumber={setNumber('devis_prochain_numero')} onSuffix={set('devis_suffixe')}
            />
            <NumberingRow
              label="Numérotation des Bons de Livraison"
              prefixValue={form.bl_prefixe} numberValue={form.bl_prochain_numero} suffixValue={form.bl_suffixe}
              onPrefix={set('bl_prefixe')} onNumber={setNumber('bl_prochain_numero')} onSuffix={set('bl_suffixe')}
            />
            <NumberingRow
              label="Numérotation des Facture d'avoir"
              prefixValue={form.avoir_prefixe} numberValue={form.avoir_prochain_numero} suffixValue={form.avoir_suffixe}
              onPrefix={set('avoir_prefixe')} onNumber={setNumber('avoir_prochain_numero')} onSuffix={set('avoir_suffixe')}
            />
          </div>
          <Field label="Entreprise Info" className="h-full">
            <Textarea value={form.entreprise_info ?? ''} onChange={set('entreprise_info')} placeholder="Adresse, ICE, RC, IF, email, téléphone, site web..." className="min-h-[280px] h-full" />
          </Field>
        </div>

        <div className="flex gap-3">
          <Button type="submit" variant="primary" icon={<Save size={15} />} loading={saving}>
            {saving ? 'Enregistrement…' : 'Save changes'}
          </Button>
          <Button type="button" variant="secondary" onClick={reload}>
            Cancel
          </Button>
        </div>
      </form>
    </FormCard>
  )
}

function CentreTab() {
  const { hasPermission } = useAuth()
  const canAccess = hasPermission('parametre', 'centre_domiciliation')
  const [view, setView] = useState('settings')

  if (!canAccess) return <RestrictedCard />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          icon={<MapPinned size={15} />}
          onClick={() => setView((v) => (v === 'settings' ? 'centres' : 'settings'))}
        >
          {view === 'settings' ? 'Gérer les centres de domiciliation' : 'Retour aux paramètres du centre'}
        </Button>
      </div>
      {view === 'settings' ? <CentreSettingsForm /> : <DomiciliationCentres />}
    </div>
  )
}

const emptyStatusForm = { nom: '', couleur_texte: '#16A34A', couleur_fond: '#DCFCE7' }

// Gestionnaire de statuts réutilisé par Services, Cachet et Mail : même écran de référence,
// mêmes règles (nom + couleur texte + couleur fond), seule l'API change.
// `manageLink` donne en plus un accès direct à la page de gestion réelle de l'entité
// (liste des Services / Cachets / Mails), au même titre que « Gérer les centres de
// domiciliation » sur l'onglet Centre — les droits d'accès restent ceux de la page visée.
function StatusManagerTab({ addTitle, api, manageLink, permissionAction }) {
  const { hasPermission } = useAuth()
  const canAccess = hasPermission('parametre', permissionAction)

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyStatusForm)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = () => {
    if (!canAccess) return
    setLoading(true)
    api.list({ page, perPage, search })
      .then((data) => { setRows(data.data); setMeta(data) })
      .catch(() => setError('Impossible de charger les statuts.'))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [page, perPage, search, canAccess, api])

  if (!canAccess) return <RestrictedCard />

  const resetForm = () => {
    setEditing(null)
    setForm(emptyStatusForm)
    setFormErrors({})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFormErrors({})
    try {
      if (editing) {
        const updated = await api.update(editing.id, form)
        setSuccess('Statut mis à jour avec succès.')
        resetForm()
        // Corrige la ligne en place plutôt que de recharger la liste : un
        // rechargement re-trie côté serveur (par nom), ce qui fait sauter la
        // ligne modifiée ailleurs dans le tableau — elle doit rester à sa place.
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      } else {
        await api.create(form)
        setSuccess('Statut ajouté avec succès.')
        setPage(1)
        resetForm()
        load()
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFormErrors(err.errors)
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    try {
      await api.remove(target.id)
      setSuccess('Statut supprimé.')
      load()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const startEdit = (r) => {
    setEditing(r)
    setForm({ nom: r.nom, couleur_texte: r.couleur_texte, couleur_fond: r.couleur_fond })
    setFormErrors({})
  }

  return (
    <div className="space-y-4">
      {manageLink && (
        <div className="flex justify-end">
          <Button variant="secondary" icon={<manageLink.icon size={15} />} to={manageLink.to}>
            {manageLink.label}
          </Button>
        </div>
      )}
      {error && <Alert tone="danger" onAutoClose={() => setError('')}>{error}</Alert>}
      {success && <Alert tone="success" onAutoClose={() => setSuccess('')}>{success}</Alert>}

      <div className="grid lg:grid-cols-[360px_1fr] gap-4 items-start">
        <FormCard title={editing ? 'Modifier le statut' : addTitle}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Statu Text" required>
              <Input required value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} placeholder="Statu Text" />
              {formErrors.nom && <span className="mt-1 block text-xs text-danger-600">{formErrors.nom[0]}</span>}
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Text Color">
                <input
                  type="color"
                  value={form.couleur_texte}
                  onChange={(e) => setForm((f) => ({ ...f, couleur_texte: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-line cursor-pointer"
                />
              </Field>
              <Field label="Background Color">
                <input
                  type="color"
                  value={form.couleur_fond}
                  onChange={(e) => setForm((f) => ({ ...f, couleur_fond: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-line cursor-pointer"
                />
              </Field>
              <Field label="Preview">
                <span
                  className="inline-flex items-center h-10 rounded-full px-3 text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
                  style={{ color: form.couleur_texte, background: form.couleur_fond }}
                >
                  {form.nom || 'Statu Text'}
                </span>
              </Field>
            </div>
            <div className="flex gap-3">
              <Button type="submit" variant="primary" icon={<Save size={15} />} loading={saving}>
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter Statu'}
              </Button>
              {editing && (
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Annuler
                </Button>
              )}
            </div>
          </form>
        </FormCard>

        <FormCard title="Liste des statuts">
          <ServerTable
            columns={[
              {
                key: 'nom',
                header: 'Nom Complet',
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    title="Modifier ce statut"
                    className="inline-flex h-9 w-36 items-center justify-center rounded-lg px-2 text-center text-xs font-semibold leading-tight hover:opacity-80"
                    style={{ color: r.couleur_texte, background: r.couleur_fond }}
                  >
                    <span className="line-clamp-2">{r.nom}</span>
                  </button>
                ),
              },
            ]}
            rows={rows}
            meta={meta}
            loading={loading}
            search={search}
            onSearchChange={(v) => { setSearch(v); setPage(1) }}
            perPage={perPage}
            onPerPageChange={(v) => { setPerPage(v); setPage(1) }}
            onPageChange={setPage}
            emptyText="Aucun statut"
            actionsHeader="Actions"
            rowActions={(r) => (
              <div className="flex justify-end gap-1.5">
                <RowBtn title="Modifier" onClick={() => startEdit(r)}><Pencil size={14} /></RowBtn>
                <RowBtn
                  title="Supprimer"
                  onClick={() => setConfirmDelete(r)}
                  className="text-danger-500 hover:text-danger-600 hover:bg-danger-50"
                >
                  <Trash2 size={14} />
                </RowBtn>
              </div>
            )}
          />
        </FormCard>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Supprimer ce statut ?"
        message={confirmDelete ? `Voulez-vous vraiment supprimer le statut "${confirmDelete.nom}" ?` : ''}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={doDelete}
      />
    </div>
  )
}

export default function Parametres() {
  // La navigation entre les pages Paramètres se fait par la sidebar (/parametres/<section>).
  const { section } = useParams()
  const tab = TABS.some((t) => t.key === section) ? section : 'compte'

  return (
    <div>
      <div>
        {tab === 'compte' && <AccountTab />}
        {tab === 'bureau' && <BureauTab />}
        {tab === 'centre' && <CentreTab />}
        {tab === 'services' && (
          <StatusManagerTab
            addTitle="Ajouter Services Status"
            api={serviceStatusApi}
            permissionAction="ajouter_services_status"
            manageLink={{ to: '/services', label: 'Gérer les Services', icon: Building2 }}
          />
        )}
        {tab === 'cachet' && (
          <StatusManagerTab
            addTitle="Ajouter Cashet Status"
            api={cachetStatusApi}
            permissionAction="ajouter_cashet_status"
            manageLink={{ to: '/cachets', label: 'Gérer les Cachets', icon: Stamp }}
          />
        )}
        {tab === 'mail' && (
          <StatusManagerTab
            addTitle="Ajouter Mail Status"
            api={mailStatusApi}
            permissionAction="ajouter_mail_status"
            manageLink={{ to: '/mails', label: 'Gérer les Mails', icon: MailIcon }}
          />
        )}
        {tab === 'assistance' && <AssistanceTab />}
      </div>
    </div>
  )
}
