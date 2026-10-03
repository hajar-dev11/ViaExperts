<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaiementLigne extends Model
{
    protected $fillable = ['paiement_id', 'service_id', 'designation', 'quantite', 'prix_unitaire', 'ordre'];

    protected $casts = [
        'quantite' => 'decimal:2',
        'prix_unitaire' => 'decimal:2',
    ];

    protected $appends = ['total'];

    public function paiement()
    {
        return $this->belongsTo(Paiement::class);
    }

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function getTotalAttribute(): string
    {
        return number_format((float) $this->quantite * (float) $this->prix_unitaire, 2, '.', '');
    }
}
