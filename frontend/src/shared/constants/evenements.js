// Évènements navigateur partagés entre modules (aucun module n'importe l'autre pour s'en servir).

/**
 * Émis après une action qui change l'échéance d'une domiciliation (« Renouveler »). Le bandeau d'alerte de la barre
 * supérieure l'écoute pour se recalculer tout de suite, sans rechargement de la page.
 * `detail` : `{ entrepriseId }` de l'entreprise concernée.
 */
export const EVT_DOMICILIATIONS_MODIFIEES = 've:domiciliations-modifiees'
