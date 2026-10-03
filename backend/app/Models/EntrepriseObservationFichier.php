<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Pièce jointe d'une observation d'entreprise. Plusieurs par observation. */
class EntrepriseObservationFichier extends Model
{
    use SoftDeletes;

    protected $table = 'entreprise_observation_fichiers';

    protected $fillable = ['observation_id', 'nom', 'chemin', 'mime', 'taille', 'uploaded_by'];

    public function observation()
    {
        return $this->belongsTo(EntrepriseObservation::class, 'observation_id');
    }

    public function auteur()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
