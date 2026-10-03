<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Rapport extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'emetteur', 'rapport_de', 'date_rapport',
        'montant_restant', 'revenu_local', 'revenu_externe', 'depense_jour',
        'solde_caisse', 'total_revenu_jour', 'descriptive',
        'document_nom', 'document_chemin', 'status', 'created_by',
    ];

    protected $casts = [
        'date_rapport' => 'date',
        'montant_restant' => 'decimal:2',
        'revenu_local' => 'decimal:2',
        'revenu_externe' => 'decimal:2',
        'depense_jour' => 'decimal:2',
        'solde_caisse' => 'decimal:2',
        'total_revenu_jour' => 'decimal:2',
    ];

    /**
     * « Total Revenu du jour » = Revenu Local + Revenu Externe.
     * Règle lisible directement sur les 4 lignes de la capture de référence
     * (0 + 3450 = 3450, 0 + 0 = 0, 0 + 2400 = 2400, 0 + 2000 = 2000).
     */
    public function recalculerRevenu(): void
    {
        $this->forceFill([
            'total_revenu_jour' => round((float) $this->revenu_local + (float) $this->revenu_externe, 2),
        ])->save();
    }

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }
}
