// « Motif de l'opération » d'un reçu de paiement — module séparé pour garder les exports de `recuPaiement.js` inchangés.

const normaliserNom = (texte) => String(texte ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * La prestation RÉELLEMENT concernée par le paiement :
 *  1. Le nom réel du ou des services du catalogue rattachés aux lignes du paiement (`lignes[].service`, relation `service_id`) ;
 *     la prestation « Domiciliation » s'écrit « Service de domiciliation », toute autre prestation garde son nom exact
 *     (« Enregistrement de contrat de domiciliation » est un autre service : il n'est pas confondu avec la domiciliation).
 *  2. À défaut — lignes sans service du catalogue, ou paiement sans ligne — le comportement d'avant : l'observation du paiement.
 * Jamais de motif inventé : ni « Service » générique, ni désignation libre de ligne.
 */
export function motifRecu(p) {
  const noms = []
  for (const ligne of p.lignes ?? []) {
    const nom = String(ligne.service ?? '').trim()
    if (nom === '') continue
    const motif = normaliserNom(nom) === 'domiciliation' ? 'Service de domiciliation' : nom
    if (!noms.includes(motif)) noms.push(motif)
  }
  return noms.length > 0 ? noms.join(', ') : String(p.observation ?? '')
}
