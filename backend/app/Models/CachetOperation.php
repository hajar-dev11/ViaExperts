<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CachetOperation extends Model
{
    protected $fillable = [
        'cachet_id', 'cachet_status_id', 'commentaire',
        'fichier_nom', 'fichier_chemin', 'created_by',
    ];

    public function cachet()
    {
        return $this->belongsTo(Cachet::class);
    }

    public function statut()
    {
        return $this->belongsTo(CachetStatus::class, 'cachet_status_id');
    }

    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
