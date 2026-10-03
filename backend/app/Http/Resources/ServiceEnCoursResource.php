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

            'operations' => $this->whenLoaded('operations', fn () => $this->operations->map(fn ($o) => [
                'id' => $o->id,
                'commentaire' => $o->commentaire,
                'statut' => $o->statut ? [
                    'nom' => $o->statut->nom,
                    'couleurTexte' => $o->statut->couleur_texte,
                    'couleurFond' => $o->statut->couleur_fond,
                ] : null,
                'par' => $o->auteur->name ?? null,
                'fichierNom' => $o->fichier_nom,
                'fichierChemin' => $o->fichier_chemin,
                'createdAt' => optional($o->created_at)->toDateTimeString(),
            ])),
        ];
    }
}
