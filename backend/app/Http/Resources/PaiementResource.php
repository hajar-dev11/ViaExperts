<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class PaiementResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'emetteur' => $this->emetteur,
            'responsable' => $this->responsable,

            'partyId' => $this->party_id,
            'client' => $this->tiers_nom,
            'clientId' => $this->client ? $this->party_id : null,
            'entrepriseId' => $this->entreprise ? $this->party_id : null,
            // Reprise sur le reçu de paiement (capture de référence) : CIN/téléphone
            // du client particulier, ICE de l'entreprise.
            'clientCin' => optional($this->client)->cin,
            'clientTelephone' => optional($this->client)->telephone,
            'entrepriseIce' => optional($this->entreprise)->ice,

            'documentId' => $this->document_id,
            'factureNumero' => $this->numeroFacture(),

            'dateOperation' => optional($this->date_operation)->toDateTimeString(),
            'dateCredit' => optional($this->date_credit)->toDateString(),
            'modePaiement' => $this->mode_paiement,
            'signature' => $this->signature,
            'observation' => $this->observation,

            'pieceJointeNom' => $this->piece_jointe_nom,
            'pieceJointeChemin' => $this->piece_jointe_chemin,
            // Le téléchargement passe par `GET /paiements/{id}/fichier` (contrôle d'accès) : ce booléen dit s'il y a un fichier.
            'aFichier' => (bool) $this->piece_jointe_chemin,

            // Paiement complémentaire : pointe vers le paiement d'origine du même service / du même client.
            'paiementOrigineId' => $this->paiement_origine_id,
            'estComplement' => $this->paiement_origine_id !== null,

            'total' => $this->total,
            'prixPaye' => $this->prix_paye,
            // Reste à payer après CE paiement, cumulé sur tous les paiements du service (voir Paiement::chargerRestes).
            'prixRestant' => $this->prix_restant,

            'status' => $this->status,

            'lignes' => $this->whenLoaded('lignes', fn () => $this->lignes->map(fn ($l) => [
                'id' => $l->id,
                'serviceId' => $l->service_id,
                // Nom RÉEL du service du catalogue (relation `service_id`), null sans service : sert au « Motif de l'opération » du reçu.
                'service' => $l->service->nom ?? null,
                'designation' => $l->designation,
                'quantite' => $l->quantite,
                'prixUnitaire' => $l->prix_unitaire,
                'total' => $l->total,
            ])),
        ];
    }
}
