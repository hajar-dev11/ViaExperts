import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { LogoFull } from '../components/Logo.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import { resetPassword } from '../api/auth.js'
import { ApiError } from '../api/http.js'

/** Réinitialisation — token + email lus depuis l'URL envoyée par email. */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const email = params.get('email') ?? ''

  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const field =
    'h-14 w-full rounded-xl border border-line bg-white px-4 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none'

  if (!token || !email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px] text-center">
          <div className="flex justify-center">
            <LogoFull className="h-20" />
          </div>
          <Alert tone="danger" className="mt-8 text-left">
            Ce lien de réinitialisation est invalide. Demandez-en un nouveau.
          </Alert>
          <Link to="/forgot-password" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirmation) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await resetPassword({ token, email, password, password_confirmation: confirmation })
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 422 || err.status === 400)) {
        setError(Object.values(err.errors ?? {})[0]?.[0] ?? err.message ?? 'Ce lien de réinitialisation est invalide ou a expiré.')
      } else {
        setError('Impossible de contacter le serveur. Réessayez dans quelques instants.')
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

        <h1 className="mt-8 text-[26px] text-ink-900">Nouveau mot de passe</h1>
        <p className="mt-1.5 text-sm text-ink-600">Choisissez un nouveau mot de passe pour {email}.</p>

        {done ? (
          <Alert tone="success" className="mt-8">
            Mot de passe réinitialisé. Redirection vers la connexion…
          </Alert>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            {error && <Alert tone="danger" onAutoClose={() => setError('')}>{error}</Alert>}

            <div>
              <label htmlFor="reset-password" className="mb-2 block text-[15px] text-ink-800">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  id="reset-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${field} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="focus-ring absolute top-1/2 right-4 -translate-y-1/2 rounded text-ink-600 transition-colors hover:text-ink-900"
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reset-password-confirm" className="mb-2 block text-[15px] text-ink-800">
                Confirmer le mot de passe
              </label>
              <input
                id="reset-password-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className={field}
              />
            </div>

            <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
              {submitting ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
