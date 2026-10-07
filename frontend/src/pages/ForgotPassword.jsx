import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { LogoFull } from '../components/Logo.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import { forgotPassword } from '../api/auth.js'
import { ApiError } from '../api/http.js'

/**
 * Demande de réinitialisation — même coquille visuelle que Login.jsx
 * (formulaire centré, mêmes styles de champ) pour rester cohérent avec le
 * flux d'authentification. Le message de succès est volontairement générique
 * (anti-énumération) : il ne confirme jamais si l'email existe en base.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const field =
    'h-14 w-full rounded-xl border border-line bg-white px-4 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none'

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Veuillez renseigner votre email.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError(Object.values(err.errors)[0]?.[0] ?? 'Email invalide.')
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Trop de tentatives. Patientez une minute avant de réessayer.')
      } else if (err instanceof ApiError) {
        // Vraie erreur serveur (ex. 500) : on ne la confond pas avec un problème
        // réseau — le message reste générique pour l'utilisateur (aucun détail
        // technique, aucune confirmation sur l'existence du compte), mais l'erreur
        // réelle part en console pour le diagnostic, au lieu d'être masquée.
        console.error('Échec de la demande de réinitialisation :', err.status, err.message)
        setError("Une erreur est survenue côté serveur. Réessayez plus tard ou contactez l'administrateur.")
      } else {
        setError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-10 sm:px-8">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center">
          <LogoFull className="h-20" />
        </div>

        <h1 className="mt-8 text-[26px] text-ink-900">Mot de passe oublié</h1>
        <p className="mt-1.5 text-sm text-ink-600">
          Indiquez votre email, nous vous enverrons un lien de réinitialisation.
        </p>

        {sent ? (
          <div className="mt-8 space-y-6">
            <Alert tone="success">
              Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.
            </Alert>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <ArrowLeft size={15} />
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            {error && <Alert tone="danger" onAutoClose={() => setError('')}>{error}</Alert>}

            <div>
              <label htmlFor="forgot-email" className="mb-2 block text-[15px] text-ink-800">
                Email
              </label>
              <input
                id="forgot-email"
                type="text"
                autoComplete="username"
                placeholder="email@viaexperts.ma"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={field}
              />
            </div>

            <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
              {submitting ? 'Envoi…' : 'Envoyer le lien'}
            </Button>

            <Link
              to="/login"
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
            >
              <ArrowLeft size={15} />
              Retour à la connexion
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
