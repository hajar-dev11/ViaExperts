<?php

namespace App\Modules\Facturation\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class DocumentCommercialResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'emetteur' => $this->emetteur,
            'responsable' => $this->responsable,

            'partyId' => $this->party_id,
            'tiers' => $this->tiers_nom, // colonne CLIENT/ENTREPRISE de la capture
            'tiersType' => $this->entreprise ? 'entreprise' : ($this->client ? 'client' : null),
            // Reprise sur l'impression (capture de référence) : ICE de l'entreprise
            // cliente, CIN du client particulier.
            'tiersIce' => optional($this->entreprise)->ice,
            'tiersCin' => optional($this->client)->cin,

            'numero' => $this->numero,
            'dateDocument' => optional($this->date_document)->toDateTimeString(),
            'datePaiement' => optional($this->date_paiement)->toDateString(),
            'dateCredit' => optional($this->date_credit)->toDateString(),
            'modePaiement' => $this->mode_paiement,
            'signature' => $this->signature,
            'note' => $this->note,

            'totalHt' => $this->total_ht,
            'totalRemise' => $this->total_remise,
            'totalNetHt' => $this->total_net_ht,
            'totalTva' => $this->total_tva,
            'totalTtc' => $this->total_ttc,
            'prixPaye' => $this->prix_paye,
            'prixRestant' => $this->prix_restant, // calculé, jamais stocké

            'status' => $this->status,

            'lignes' => $this->whenLoaded('lignes', fn () => $this->lignes->map(fn ($l) => [
                'id' => $l->id,
                'serviceId' => $l->service_id,
                'designation' => $l->designation,
                'quantite' => $l->quantite,
                'prixUnitaire' => $l->prix_unitaire,
                'remisePourcent' => $l->remise_pourcent,
                'tvaPourcent' => $l->tva_pourcent,
                'totalHt' => $l->total_ht,
                'totalNetHt' => $l->total_net_ht,
                'totalTva' => $l->total_tva,
                'totalTtc' => $l->total_ttc,
            ])),
        ];
    }
}
