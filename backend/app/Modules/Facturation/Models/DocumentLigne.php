<?php

namespace App\Modules\Facturation\Models;

use App\Models\Service;
use Illuminate\Database\Eloquent\Model;

class DocumentLigne extends Model
{
    protected $fillable = [
        'document_id', 'service_id', 'designation',
        'quantite', 'prix_unitaire', 'remise_pourcent', 'tva_pourcent', 'ordre',
    ];

    protected $casts = [
        'quantite' => 'decimal:2',
        'prix_unitaire' => 'decimal:2',
        'remise_pourcent' => 'decimal:2',
        'tva_pourcent' => 'decimal:2',
    ];

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
        $brut = (float) $this->quantite * (float) $this->prix_unitaire;

        return number_format($brut - $brut * ((float) $this->remise_pourcent / 100), 2, '.', '');
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
