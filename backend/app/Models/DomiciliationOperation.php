<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Renouvellement, déclaration ou résiliation d'une domiciliation. */
class DomiciliationOperation extends Model
{
    /** Doit rester aligné sur la migration `create_domiciliation_operations_table`. */
    public const TYPES = ['renouvellement', 'declaration', 'resiliation', 'activation'];

    protected $table = 'domiciliation_operations';

    protected $fillable = [
        'domiciliation_id', 'type', 'commentaire',
        'fichier_nom', 'fichier_chemin', 'created_by',
    ];

    public function domiciliation()
    {
        return $this->belongsTo(Domiciliation::class);
    }

    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
