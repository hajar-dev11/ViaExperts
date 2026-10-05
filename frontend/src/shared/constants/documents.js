// Constantes partagées par la Facturation, les Paiements et les Rapports : émetteurs des documents et modes de
// paiement. Elles vivaient dans `api/facturation.js` ; elles sont désormais ici (emplacement PARTAGÉ cible de la
// migration Modular Monolith). `api/facturation.js` les ré-exporte pour que tous les imports existants continuent
// de fonctionner sans changement.

export const EMETTEURS = [
  { value: 'via_experts', label: 'Via Experts', sousTitre: 'Centre Domiciliation' },
  { value: 'bureau_comptabilite', label: 'Maitre : Morad Bendeq', sousTitre: 'Bureau de Comptabilité' },
]

export const MODES_PAIEMENT = [
  'Virement', 'Chèque', 'Traite', 'Espèce', 'Versement',
  'Carte bancaire', 'Affacturage', 'Crédit', 'Autres à déterminer',
]
