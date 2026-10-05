// COMPATIBILITÉ TEMPORAIRE (migration Modular Monolith — Facturation, étape 14) : le rendu des documents commerciaux
// (Facture / Devis / Bon de livraison / Facture d'avoir) vit maintenant dans `modules/facturation/print/documentCommercial.js`.
// Ce fichier ne contient aucune logique : il ré-exporte les mêmes fonctions (`documentPrint.js` et les tests l'importent
// encore ici). À supprimer quand plus aucun fichier n'importe cet ancien chemin.
export * from '../../modules/facturation/print/documentCommercial.js'