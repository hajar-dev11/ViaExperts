<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Observation datée d'une entreprise (bloc « Observations » de sa fiche). */
class EntrepriseObservation extends Model
{
    use SoftDeletes;

    protected $table = 'entreprise_observations';

    protected $fillable = ['entreprise_id', 'contenu', 'status', 'privee', 'created_by'];

    protected $casts = ['privee' => 'boolean'];

    public function entreprise()
    {
        return $this->belongsTo(Entreprise::class, 'entreprise_id', 'party_id');
    }

    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Pièces jointes, la plus ancienne d'abord (ordre de dépôt). */
    public function fichiers()
    {
        return $this->hasMany(EntrepriseObservationFichier::class, 'observation_id')->orderBy('id');
    }

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Règle de visibilité d'une observation privée, validée avec l'utilisatrice :
     * **son auteur et les administrateurs** uniquement.
     * Une observation non privée est lisible par tout le monde.
     */
    public function estVisiblePar(?User $user): bool
    {
        if (! $this->privee) {
            return true;
        }

        return $user !== null && ($user->is_admin || $this->created_by === $user->id);
    }
}
