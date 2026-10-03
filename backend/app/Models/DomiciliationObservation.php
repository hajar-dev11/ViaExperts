<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DomiciliationObservation extends Model
{
    use SoftDeletes;

    protected $fillable = ['domiciliation_id', 'contenu', 'privee', 'fichier_nom', 'fichier_chemin', 'created_by', 'status'];

    protected $casts = ['privee' => 'boolean'];

    public function domiciliation()
    {
        return $this->belongsTo(Domiciliation::class);
    }

    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Règle de visibilité d'une observation privée, identique à
     * `EntrepriseObservation::estVisiblePar` : son auteur et les
     * administrateurs uniquement. Non privée = lisible par tous.
     */
    public function estVisiblePar(?User $user): bool
    {
        if (! $this->privee) {
            return true;
        }

        return $user !== null && ($user->is_admin || $this->created_by === $user->id);
    }
}
