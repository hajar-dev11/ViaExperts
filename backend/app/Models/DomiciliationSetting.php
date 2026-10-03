<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomiciliationSetting extends Model
{
    protected $fillable = [
        'logo_path',
        'signature_path',
        'nom_societe',
        'gerant',
        'prix_domiciliation',
        'references_recu',
        'afficher_entreprise_info_recu',
        'ice_societe',
        'entreprise_info',
        'facture_prefixe', 'facture_prochain_numero', 'facture_suffixe',
        'devis_prefixe', 'devis_prochain_numero', 'devis_suffixe',
        'bl_prefixe', 'bl_prochain_numero', 'bl_suffixe',
        'avoir_prefixe', 'avoir_prochain_numero', 'avoir_suffixe',
    ];

    protected $casts = [
        'afficher_entreprise_info_recu' => 'boolean',
        'prix_domiciliation' => 'decimal:2',
    ];
}
