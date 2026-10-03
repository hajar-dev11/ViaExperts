<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeclarationTvaLigne extends Model
{
    protected $table = 'declaration_tva_lignes';

    protected $fillable = [
        'declaration_id', 'ordre_ref', 'fact_num', 'designation',
        'ht', 'tva', 'ttc', 'identifiant_fiscal', 'libelle_fournisseur',
        'ice', 'taux', 'id_paie', 'date_paie', 'date_fac', 'ordre',
    ];

    protected $casts = [
        'ht' => 'decimal:2',
        'tva' => 'decimal:2',
        'ttc' => 'decimal:2',
        'taux' => 'decimal:2',
        'date_paie' => 'date',
        'date_fac' => 'date',
    ];

    public function declaration()
    {
        return $this->belongsTo(DeclarationTva::class, 'declaration_id');
    }
}
