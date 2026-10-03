<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class EntrepriseResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->party_id,
            'status' => $this->party->status,
            'denomination' => $this->denomination,
            'tribunal' => $this->tribunal,
            'forme' => $this->forme_juridique,
            'ice' => $this->ice,
            'rc' => $this->rc,
            'if' => $this->if,
            'tp' => $this->tp,
            'cnss' => $this->cnss,
            'dateDebut' => optional($this->date_debut_activite)->format('Y-m-d'),
            'capital' => $this->capital,
            'situation' => $this->situation,
            'single' => $this->single,
            'periode' => $this->periode_declaration_tva,
            'local' => $this->local,
            'centreDomiciliation' => $this->centreDomiciliation?->nom,
            'centreDomiciliationId' => $this->centre_domiciliation_id,
            'numDossier' => $this->numero_dossier,
            'numArchive' => $this->numero_archive,
            'observation' => $this->observation,
            'observations' => $this->observation,
            'clientId' => $this->client_id,
            'client' => $this->client?->nom,
            'secteurs' => $this->secteurs->map(fn ($s) => [
                'secteur' => $s->secteur,
                'secteurAutre' => '',
                'activite' => $s->activite,
            ])->values(),
            // Personnes rattachées : gérants, associés, partenaires.
            'associes' => $this->whenLoaded('associes', fn () => $this->associes->map(fn ($a) => [
                'id' => $a->id,
                'nom' => $a->nom,
                'cin' => $a->cin,
                'type' => $a->type,
                'adresse' => $a->adresse,
                'telephone' => $a->telephone,
                'telephone2' => $a->telephone_2,
                'email' => $a->email,
            ])->values(), []),

            'documents' => $this->whenLoaded('documents', fn () => $this->documents->map(fn ($d) => [
                'id' => $d->id,
                'nom' => $d->nom,
                'chemin' => $d->chemin,
                'taille' => $d->taille,
                'status' => $d->status,
                'par' => $d->auteur->name ?? null,
                'createdAt' => optional($d->created_at)->toDateTimeString(),
            ])->values(), []),

            // Une observation cochée « privée » n'est renvoyée qu'à son auteur
            // et aux administrateurs : le filtrage est fait ici, donc il
            // s'applique partout où cette ressource est utilisée.
            'observationsListe' => $this->whenLoaded('observationsListe', fn () => $this->observationsListe
                ->filter(fn ($o) => $o->estVisiblePar($request->user()))
                ->map(fn ($o) => [
                    'id' => $o->id,
                    'contenu' => $o->contenu,
                    'status' => $o->status,
                    'privee' => $o->privee,
                    'par' => $o->auteur->name ?? null,
                    'createdAt' => optional($o->created_at)->toDateTimeString(),
                    'fichiers' => $o->relationLoaded('fichiers')
                        ? $o->fichiers->map(fn ($f) => [
                            'id' => $f->id,
                            'nom' => $f->nom,
                            'taille' => $f->taille,
                        ])->values()
                        : [],
                ])->values(), []),

            'createdAt' => $this->party->created_at,
            'updatedAt' => $this->party->updated_at,
            // Membre du système (assistant ou administrateur) qui a créé la
            // fiche. `null` sur les fiches antérieures à cette colonne.
            'createdBy' => $this->party->auteur->name ?? null,
        ];
    }
}
