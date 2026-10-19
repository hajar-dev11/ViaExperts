<?php

namespace App\Modules\Facturation\Models;

use App\Models\Service;
use App\Support\ColonneBase;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;

class DocumentLigne extends Model
{
    protected $fillable = [
        'document_id', 'service_id', 'designation',
        'quantite', 'prix_unitaire', 'remise_pourcent', 'remise_montant', 'tva_pourcent', 'ordre',
    ];

    protected $casts = [
        'quantite' => 'decimal:2',
        'prix_unitaire' => 'decimal:2',
        'remise_pourcent' => 'decimal:2',
        'remise_montant' => 'decimal:2',
        'tva_pourcent' => 'decimal:2',
    ];

    /** Total HT de la ligne avant remise. */
    public function brut(): float
    {
        return (float) $this->quantite * (float) $this->prix_unitaire;
    }

    /**
     * Remise de la ligne EN Dh.
     *
     * Ligne récente : le montant saisi (plafonné au total HT de la ligne, jamais négatif).
     * Ligne enregistrée avant la migration (`remise_montant` NULL) : l'ancien pourcentage appliqué au total HT, comme avant — les
     * montants historiques ne changent pas.
     */
    public function remiseEnDh(): float
    {
        $brut = $this->brut();

        if ($this->remise_montant !== null) {
            return min(max((float) $this->remise_montant, 0.0), $brut);
        }

        return $brut * ((float) $this->remise_pourcent / 100);
    }

    /**
     * Attributs écrivables d'une ligne selon le schéma RÉEL de la base.
     *
     * Base à jour : la remise en montant est enregistrée. Base SANS la colonne `remise_montant` (migration non appliquée) : une
     * ligne sans remise s'enregistre normalement ; une ligne AVEC remise est REFUSÉE par un message clair — elle ne serait pas
     * stockable sans perdre le montant (le pourcentage ne peut pas le représenter exactement).
     */
    public static function attributsEcrivables(array $ligne): array
    {
        if (ColonneBase::existe('document_lignes', 'remise_montant')) {
            return $ligne;
        }

        if ((float) ($ligne['remise_montant'] ?? 0) > 0) {
            throw ValidationException::withMessages([
                'lignes' => ['La remise en montant nécessite une mise à jour de la base de données (migration « add_remise_montant_to_document_lignes_table » non appliquée). Le document n\'a pas été enregistré.'],
            ]);
        }

        unset($ligne['remise_montant']);

        return $ligne;
    }

    protected $appends = ['total_ht', 'total_net_ht', 'total_tva', 'total_ttc'];

    public function document()
    {
        return $this->belongsTo(DocumentCommercial::class, 'document_id');
    }

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function getTotalHtAttribute(): string
    {
        return number_format((float) $this->quantite * (float) $this->prix_unitaire, 2, '.', '');
    }

    public function getTotalNetHtAttribute(): string
    {
        return number_format($this->brut() - $this->remiseEnDh(), 2, '.', '');
    }

    public function getTotalTvaAttribute(): string
    {
        return number_format((float) $this->total_net_ht * ((float) $this->tva_pourcent / 100), 2, '.', '');
    }

    public function getTotalTtcAttribute(): string
    {
        return number_format((float) $this->total_net_ht + (float) $this->total_tva, 2, '.', '');
    }
}
