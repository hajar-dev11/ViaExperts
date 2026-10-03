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
            'factureNumero' => $this->whenLoaded('document')->numero ?? null,

            'dateOperation' => optional($this->date_operation)->toDateTimeString(),
            'dateCredit' => optional($this->date_credit)->toDateString(),
            'modePaiement' => $this->mode_paiement,
            'signature' => $this->signature,
            'observation' => $this->observation,

            'pieceJointeNom' => $this->piece_jointe_nom,
            'pieceJointeChemin' => $this->piece_jointe_chemin,

            'total' => $this->total,
            'prixPaye' => $this->prix_paye,
            'prixRestant' => $this->prix_restant,

            'status' => $this->status,

            'lignes' => $this->whenLoaded('lignes', fn () => $this->lignes->map(fn ($l) => [
                'id' => $l->id,
                'serviceId' => $l->service_id,
                'designation' => $l->designation,
                'quantite' => $l->quantite,
                'prixUnitaire' => $l->prix_unitaire,
                'total' => $l->total,
            ])),
        ];
    }
}
