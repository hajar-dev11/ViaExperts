// Regroupement des « responsables » des documents commerciaux pour le filtre des listes.
// « Via Experts » (émetteur Via Experts) et « via Experts » (nom de société du Bureau de Comptabilité) désignent le même
// responsable : ils ne doivent former qu'une entrée. Les données des documents ne sont jamais modifiées.

/** Clé de regroupement d'un responsable : sans espaces superflus ni différence de casse. */
export const cleResponsable = (valeur) => String(valeur).trim().replace(/\s+/g, ' ').toLowerCase()

/** Libellé affiché pour un groupe de variantes : celui d'un émetteur connu (« Via Experts »), sinon le premier rencontré. */
export function libelleResponsable(variantes, emetteurs = []) {
  const connu = emetteurs.find((e) => variantes.some((v) => cleResponsable(v) === cleResponsable(e.label)))
  return connu ? connu.label : variantes[0].trim()
}

/** Entrées du filtre : `[{ cle, libelle }]`, une seule par responsable, dans l'ordre d'apparition. */
export function listerResponsables(documents, emetteurs = []) {
  const groupes = new Map()
  documents.forEach((d) => {
    if (!d.responsable) return
    const cle = cleResponsable(d.responsable)
    groupes.set(cle, [...(groupes.get(cle) ?? []), d.responsable])
  })
  return [...groupes.entries()].map(([cle, variantes]) => ({ cle, libelle: libelleResponsable(variantes, emetteurs) }))
}
