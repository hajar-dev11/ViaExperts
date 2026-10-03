import Badge from './ui/Badge.jsx'

/**
 * StatusBadge — pastille de statut métier.
 *
 * API inchangée : `<StatusBadge status="Payée" />`.
 *
 * Le Lot 1 remplace la table de classes CSS en dur par une table de TONALITÉS
 * sémantiques du design system : les couleurs suivent désormais
 * automatiquement les tokens (succès / attente / danger / info).
 * Un statut inconnu retombe sur une tonalité neutre, jamais sur du vide.
 */

const TONE_BY_STATUS = {
  // Abouti / validé
  Normale: 'success',
  'En Cours': 'success',
  Payée: 'success',
  Livré: 'success',
  Accepté: 'success',
  Déclarée: 'success',
  Terminé: 'success',
  Réception: 'success',
  Active: 'success',
  Soldé: 'success',

  // En attente / à surveiller
  'En Attente': 'warning',
  'En attente': 'warning',
  'En cours': 'warning',
  Renouveler: 'warning',
  Partiel: 'warning',
  'Au Bureau': 'warning',
  'Non Déclarée': 'warning',
  Suspendue: 'warning',
  Alerte: 'warning',

  // Information
  'Demande Certificat Négatif': 'info',
  Émise: 'info',
  Nouveau: 'info',
  Déclaré: 'info',

  // Négatif
  Résilié: 'danger',
  Refusé: 'danger',
  Retrait: 'danger',
  Expiré: 'danger',
  Impayé: 'danger',
  'Bloqué': 'danger',

  // Sous surveillance, sans être bloqué
  'Liste Noire': 'warning',

  // Sorti du flux courant
  Archivé: 'neutral',
  Archives: 'neutral',
  Corbeille: 'neutral',
}

export default function StatusBadge({ status, className = '' }) {
  if (status === null || status === undefined || status === '') {
    return <span className="text-sm text-ink-600">—</span>
  }

  return (
    <Badge tone={TONE_BY_STATUS[status] ?? 'neutral'} className={`rounded-full ${className}`}>
      {status}
    </Badge>
  )
}
