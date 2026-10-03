import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, FileText, Building2, TrendingUp, Calculator, Receipt, PieChart, ClipboardList,
} from 'lucide-react'
import Logo, { LogoFull } from '../components/Logo.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { ApiError } from '../api/http.js'

/** Les 4 piliers du métier, affichés explicitement sur le panneau de marque. */
const PILIERS = [
  { Icon: Building2, label: 'Domiciliation' },
  { Icon: Calculator, label: 'Comptabilité' },
  { Icon: Receipt, label: 'Facturation' },
  { Icon: ClipboardList, label: 'Gestion' },
]

/**
 * Page de connexion — panneau de marque (identité Via Experts, comptabilité /
 * facturation / domiciliation) à gauche sur grand écran, formulaire à droite.
 * Empilés sur mobile, panneau de marque réduit à l'en-tête avec le logo.
 *
 * ⚠️ Logique d'authentification strictement inchangée (Sanctum SPA, mêmes
 * appels, mêmes champs, mêmes messages d'erreur) : seule la mise en page a
 * changé par rapport à la version précédente (fond `login-bg.jpg`, jamais
 * fourni, remplacé ici par un décor auto-suffisant construit avec les
 * couleurs de marque déjà utilisées dans le reste de l'application).
 */

/** Icône décorative flottante, discrète, dans la teinte de la palette de marque. */
function IconeFlottante({ Icon, className, size = 28 }) {
  return (
    <span className={`pointer-events-none absolute text-white/15 ${className}`}>
      <Icon size={size} strokeWidth={1.4} />
    </span>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, login } = useAuth()
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname ?? '/'} replace />
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!identifiant.trim() || !motDePasse.trim()) {
      setError('Veuillez renseigner votre identifiant et votre mot de passe.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await login(identifiant.trim(), motDePasse, remember)
      navigate(location.state?.from?.pathname ?? '/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError(Object.values(err.errors)[0]?.[0] ?? 'Identifiant ou mot de passe incorrect.')
      } else {
        setError('Impossible de contacter le serveur. Réessayez dans quelques instants.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const field =
    'h-14 w-full rounded-xl border border-line bg-white px-4 text-[15px] text-ink-900 transition-colors placeholder:text-ink-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none'

  return (
    <div className="flex min-h-screen bg-white">
      {/* ---- Panneau de marque (grand écran) ------------------------------- */}
      <div className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12 xl:px-20">
        {/* Trame de points, très discrète, pour donner de la texture sans surcharger. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
        {/* Icônes métier flottantes — facturation, immeubles/domiciliation, courbes financières. */}
        <IconeFlottante Icon={FileText} className="top-24 right-16 rotate-[-8deg]" size={64} />
        <IconeFlottante Icon={Receipt} className="bottom-40 right-28 rotate-[6deg]" size={46} />
        <IconeFlottante Icon={Building2} className="top-[42%] right-6 rotate-[4deg]" size={54} />
        <IconeFlottante Icon={PieChart} className="bottom-24 left-10 rotate-[-4deg]" size={40} />
        <IconeFlottante Icon={Calculator} className="top-16 left-10" size={34} />

        <Logo dark />

        <div className="relative">
          <div className="flex items-center gap-2 text-white">
            <TrendingUp size={22} strokeWidth={1.6} />
            <span className="text-xs font-semibold tracking-[0.16em] text-white/70 uppercase">
              Cabinet Comptable et de Conseil
            </span>
          </div>
          <h1 className="mt-4 max-w-md text-[32px] leading-[1.2] font-semibold text-white">
            La gestion comptable et la domiciliation, simplifiées.
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">
            Facturation, paiements, déclarations et dossiers clients réunis dans un seul espace de gestion.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-2.5">
            {PILIERS.map(({ Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3.5 py-2.5 backdrop-blur-sm"
              >
                <Icon size={16} strokeWidth={1.8} className="shrink-0 text-white/85" />
                <span className="text-[13px] font-medium text-white/90">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative h-4" />
      </div>

      {/* ---- Formulaire ------------------------------------------------------ */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="flex justify-center lg:hidden">
            <LogoFull className="h-20" />
          </div>

          <h1 className="mt-8 text-[26px] text-ink-900 lg:mt-0">Accédez à vos services facilement</h1>
          <p className="mt-1.5 text-sm text-ink-600">Connectez-vous avec votre identifiant Via Experts.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            {error && <Alert tone="danger">{error}</Alert>}

            <div>
              <label htmlFor="login-email" className="mb-2 block text-[15px] text-ink-800">
                Email
              </label>
              <input
                id="login-email"
                type="text"
                autoComplete="username"
                placeholder="email@viaexperts.ma"
                value={identifiant}
                onChange={(e) => setIdentifiant(e.target.value)}
                className={field}
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-2 block text-[15px] text-ink-800">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
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

            <div className="flex items-center justify-between text-sm">
              <label htmlFor="login-remember" className="flex cursor-pointer items-center gap-2 text-ink-700 select-none">
                <input
                  id="login-remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-line text-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                Souviens-toi de moi
              </label>
              <Link to="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
                Mot de passe oublié ?
              </Link>
            </div>

            <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
              {submitting ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
