// Regroupement des « responsables » des documents et paiements pour les filtres « Tous les responsables ».
// « Via Experts » (émetteur Via Experts) et « via Experts » (nom de société du Bureau de Comptabilité) désignent le même
// responsable : ils ne doivent former qu'une entrée. Les données enregistrées ne sont jamais modifiées.
//
// Les émetteurs connus (`EMETTEURS` : « Via Experts » et « Maitre : Morad Bendeq ») figurent TOUJOURS dans la liste,
// même quand aucun document ne leur est encore rattaché : un responsable ne disparaît pas du filtre faute de données.

/** Clé de regroupement d'un responsable : sans espaces superflus, sans différence de casse ni d'accent (« Maître » = « Maitre »). */
export const cleResponsable = (valeur) => String(valeur)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase()

/** Libellé affiché pour un groupe de variantes : celui d'un émetteur connu (« Via Experts »), sinon le premier rencontré. */
export function libelleResponsable(variantes, emetteurs = []) {
  const connu = emetteurs.find((e) => variantes.some((v) => cleResponsable(v) === cleResponsable(e.label)))
  return connu ? connu.label : variantes[0].trim()
}

/**
 * Entrées du filtre : `[{ cle, libelle }]`, une seule par responsable.
 * Les émetteurs connus d'abord (dans leur ordre), puis les autres responsables présents dans les données, dans l'ordre d'apparition.
 */
export function listerResponsables(documents, emetteurs = []) {
  const groupes = new Map()
  emetteurs.forEach((e) => groupes.set(cleResponsable(e.label), [e.label]))
  documents.forEach((d) => {
    if (!d.responsable) return
    const cle = cleResponsable(d.responsable)
    groupes.set(cle, [...(groupes.get(cle) ?? []), d.responsable])
  })
  return [...groupes.entries()].map(([cle, variantes]) => ({ cle, libelle: libelleResponsable(variantes, emetteurs) }))
}

/** Le responsable d'une ligne correspond-il à la clé choisie dans le filtre ? (clé vide = tous) */
export const correspondAuResponsable = (ligne, cle) => !cle || (!!ligne.responsable && cleResponsable(ligne.responsable) === cle)
