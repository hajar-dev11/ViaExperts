<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class ServiceEnCoursResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->id,

            'serviceId' => $this->service_id,
            'service' => $this->whenLoaded('service')->nom ?? null,

            'clientId' => $this->client_id,
            'client' => $this->whenLoaded('client')->nom ?? null,

            // Statut issu de `service_statuses` : le badge reprend ses deux couleurs.
            'statut' => $this->whenLoaded('statut') ? [
                'id' => $this->statut->id,
                'nom' => $this->statut->nom,
                'couleurTexte' => $this->statut->couleur_texte,
                'couleurFond' => $this->statut->couleur_fond,
            ] : null,

            'dateDepart' => optional($this->date_depart)->toDateTimeString(),
            'derniereOperation' => optional($this->derniere_operation)->toDateTimeString(),
            'status' => $this->status,

            // Fil complet du service, le plus récent d'abord (voir ServiceEnCoursOperationResource).
            'operations' => $this->whenLoaded('operations', fn () => $this->operations
                ->map(fn ($o) => (new ServiceEnCoursOperationResource($o))->resolve($request))
                ->values()),
        ];
    }
}
