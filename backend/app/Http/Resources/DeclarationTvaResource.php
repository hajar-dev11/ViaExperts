<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class DeclarationTvaResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'entrepriseId' => $this->entreprise_id,
            'nomComplet' => $this->whenLoaded('entreprise')->denomination ?? null,
            'clientIf' => $this->client_if,
            'identifiantPaiement' => $this->identifiant_paiement,

            'periodeType' => $this->periode_type,
            'periodeValeur' => $this->periode_valeur,
            'periode' => "{$this->periode_type} : {$this->periode_valeur}",
            'annee' => $this->annee,
            'regime' => $this->regime,

            'situation' => $this->situation,
            'totalHt' => $this->total_ht,
            'totalTva' => $this->total_tva,
            'totalTtc' => $this->total_ttc,

            'status' => $this->status,
            'date' => optional($this->created_at)->toDateTimeString(),

            'lignes' => $this->whenLoaded('lignes', fn () => $this->lignes->map(fn ($l) => [
                'id' => $l->id,
                'ordreRef' => $l->ordre_ref,
                'factNum' => $l->fact_num,
                'designation' => $l->designation,
                'ht' => $l->ht,
                'tva' => $l->tva,
                'ttc' => $l->ttc,
                'identifiantFiscal' => $l->identifiant_fiscal,
                'libelleFournisseur' => $l->libelle_fournisseur,
                'ice' => $l->ice,
                'taux' => $l->taux,
                'idPaie' => $l->id_paie,
                'datePaie' => optional($l->date_paie)->toDateString(),
                'dateFac' => optional($l->date_fac)->toDateString(),
            ])),
        ];
    }
}
