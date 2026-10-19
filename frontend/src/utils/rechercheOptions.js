// Recherche dans une liste d'options (voir components/SelectRecherche.jsx) : fonctions pures, testables sans navigateur.

/** Minuscules sans accents : « société » se trouve en tapant « societe ». */
export const normaliserRecherche = (texte) =>
  String(texte ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Filtre les options par leur libellé OU leur groupe (« Entreprises » / « Clients »), sans tenir compte des accents ni de la casse.
 * Une saisie vide renvoie toutes les options.
 */
export function filtrerOptions(options, saisie) {
  const q = normaliserRecherche(String(saisie ?? '').trim())
  if (!q) return options
  return options.filter((o) => normaliserRecherche(o.label).includes(q) || normaliserRecherche(o.groupe).includes(q))
}

/**
 * Options « entreprise » d'une liste d'entreprises ; `valeur` choisit ce qui est enregistré (identifiant par défaut).
 * Les deux groupes (entreprises / clients) peuvent partager un identifiant : la clé `cle` les distingue.
 */
export const optionsEntreprises = (entreprises, valeur = (e) => e.id) =>
  (entreprises ?? []).map((e) => ({ cle: `Entreprises-${e.id}`, value: valeur(e), label: e.denomination, groupe: 'Entreprises' }))

/**
 * « Client IF » d'une déclaration : l'identifiant fiscal de l'entreprise choisie (champ `if` de sa fiche).
 * Le champ se remplit à la sélection, mais ne remplace jamais une saisie à la main : il n'est réécrit que s'il est vide ou s'il
 * contient encore l'identifiant fiscal de l'entreprise précédemment choisie (changement d'entreprise).
 *
 * @param entreprises  liste des entreprises (`{ id, if }`)
 * @param ancienId     entreprise choisie avant ce changement ('' si aucune)
 * @param nouvelId     entreprise qui vient d'être choisie ('' si la sélection est vidée)
 * @param valeurActuelle valeur actuelle du champ « Client IF »
 */
export function clientIfApresChoix(entreprises, ancienId, nouvelId, valeurActuelle) {
  const identifiantFiscal = (id) => String((entreprises ?? []).find((e) => String(e.id) === String(id))?.if ?? '').trim()
  const actuelle = String(valeurActuelle ?? '')
  const modifieeAMain = actuelle.trim() !== '' && actuelle.trim() !== identifiantFiscal(ancienId)
  return modifieeAMain ? actuelle : identifiantFiscal(nouvelId)
}

/** Options « client » d'une liste de clients (voir `optionsEntreprises`). */
export const optionsClients = (clients, valeur = (c) => c.id) =>
  (clients ?? []).map((c) => ({ cle: `Clients-${c.id}`, value: valeur(c), label: c.nom, groupe: 'Clients' }))
