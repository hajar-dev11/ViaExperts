<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ClientResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->party_id,
            'status' => $this->party->status,
            'genre' => $this->genre,
            'nom' => $this->nom,
            'nomAr' => $this->nom_ar,
            'nationalite' => $this->nationalite,
            'naissance' => optional($this->date_naissance)->format('Y-m-d'),
            'cin' => $this->cin,
            'email' => $this->email,
            'tel' => $this->telephone,
            'tel2' => $this->telephone_2,
            'adresse' => $this->adresse,
            'adresseAr' => $this->adresse_ar,

            // Entreprise(s) dont ce client est le titulaire — alimente le bloc
            // « Entreprise » de la page Informations Client.
            'entreprises' => $this->whenLoaded('entreprises', fn () => $this->entreprises->map(fn ($e) => [
                'id' => $e->party_id,
                'denomination' => $e->denomination,
                'forme' => $e->forme_juridique,
                'ice' => $e->ice,
                'if' => $e->if,
                'situation' => $e->situation,
                'local' => $e->local,
                'centreDomiciliation' => $e->nomCentreDomiciliation(),
            ])->values(), []),

            'createdAt' => $this->party->created_at,
            'updatedAt' => $this->party->updated_at,
            // Membre du système (assistant ou administrateur) qui a créé la
            // fiche. `null` sur les fiches antérieures à cette colonne.
            'createdBy' => $this->party->auteur->name ?? null,
        ];
    }
}
