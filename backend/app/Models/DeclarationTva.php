<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DeclarationTva extends Model
{
    use SoftDeletes;

    protected $table = 'declarations_tva';

    public const SITUATIONS = ['declaree', 'non_declaree'];

    /** type → groupe de permissions du catalogue. */
    public const MODULES = ['tva' => 'declaration', 'chiffre_affaire' => 'chiffre_affaire'];

    protected $fillable = [
        'type', 'entreprise_id', 'client_if', 'identifiant_paiement',
        'periode_type', 'periode_valeur', 'annee', 'regime',
        'situation', 'total_ht', 'total_tva', 'total_ttc',
        'status', 'created_by',
    ];

    protected $casts = [
        'periode_valeur' => 'integer',
        'annee' => 'integer',
        'total_ht' => 'decimal:2',
        'total_tva' => 'decimal:2',
        'total_ttc' => 'decimal:2',
    ];

    public function lignes()
    {
        return $this->hasMany(DeclarationTvaLigne::class, 'declaration_id')->orderBy('ordre');
    }

    public function entreprise()
    {
        return $this->belongsTo(Entreprise::class, 'entreprise_id', 'party_id');
    }

    /** Totaux de l'en-tête « Chiffre d'Affaire », recalculés depuis les lignes. */
    public function recalculerTotaux(): void
    {
        $this->forceFill([
            'total_ht' => round($this->lignes->sum(fn ($l) => (float) $l->ht), 2),
            'total_tva' => round($this->lignes->sum(fn ($l) => (float) $l->tva), 2),
            'total_ttc' => round($this->lignes->sum(fn ($l) => (float) $l->ttc), 2),
        ])->save();
    }

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeType($query, string $type)
    {
        return $query->where('type', $type);
    }
}
