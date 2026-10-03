/**
 * Point d'entrée historique de la facture de domiciliation.
 *
 * Le contenu a été déplacé dans `documentsDomiciliation.js`, qui produit
 * désormais les QUATRE documents du dossier (facture, contrat, attestation,
 * procuration) à partir des cases cochées sur la domiciliation.
 *
 * Ce fichier est conservé pour que les pages qui importaient déjà
 * `imprimerFactureDomiciliation` / `chargerSignatureDomiciliation` continuent
 * de fonctionner à l'identique, sans modification.
 */
export {
  imprimerFactureDomiciliation,
  chargerSignatureDomiciliation,
} from './documentsDomiciliation.js'
