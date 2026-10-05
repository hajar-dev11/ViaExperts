// COMPATIBILITÉ TEMPORAIRE (migration Modular Monolith — Facturation, étape 14) : l'API Facturation vit maintenant dans
// `modules/facturation/api/facturation.js`. Ce fichier ne contient aucune logique : il ré-exporte les mêmes fonctions et
// constantes pour les imports existants. À supprimer quand plus aucun fichier n'importe cet ancien chemin.
export * from '../modules/facturation/api/facturation.js'