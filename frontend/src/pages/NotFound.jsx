import { Compass, Home } from 'lucide-react'
import Button from '../components/ui/Button.jsx'

/**
 * NotFound — URL inconnue. Affichée DANS le Layout (menu visible) pour un utilisateur connecté ;
 * un visiteur non connecté est d'abord renvoyé vers /login par RequireAuth.
 */
export default function NotFound() {
  return (
    <div className="grid place-items-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-card">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600">
          <Compass size={22} />
        </span>
        <p className="mt-4 text-sm font-semibold text-brand-600">Erreur 404</p>
        <h1 className="mt-1 text-xl text-ink-900">Page introuvable</h1>
        <p className="mt-2 text-sm text-ink-600">
          La page que vous cherchez n'existe pas ou a été déplacée. Vérifiez l'adresse ou revenez à l'accueil.
        </p>
        <div className="mt-6 flex justify-center">
          <Button to="/" icon={<Home size={16} />}>
            Retour à l'accueil
          </Button>
        </div>
      </div>
    </div>
  )
}
