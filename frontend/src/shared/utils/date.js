// Utilitaires de date PARTAGÉS (aucune dépendance vers un module métier). `aujourdhui` vivait dans `utils/domiciliation.js`
// alors qu'elle est utilisée par Facturation, Paiements et Domiciliation (migration Modular Monolith, Domiciliation — étape 17) ;
// le code est repris TEL QUEL.

/** Date du jour au format attendu par `<input type="date">`, jamais codée en dur. */
export function aujourdhui() {
  const d = new Date()
  const mois = String(d.getMonth() + 1).padStart(2, '0')
  const jour = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mois}-${jour}`
}

/** Date et heure LOCALES « AAAA-MM-JJ HH:mm:ss » (format attendu par l'API), jamais en UTC : le serveur écrit lui aussi en heure du Maroc. */
export function maintenantLocal() {
  const d = new Date()
  const deux = (n) => String(n).padStart(2, '0')
  return `${aujourdhui()} ${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`
}
