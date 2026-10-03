<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceEnCoursOperation extends Model
{
    protected $fillable = [
        'service_en_cours_id', 'service_status_id', 'commentaire',
        'fichier_nom', 'fichier_chemin', 'created_by',
    ];

    public function serviceEnCours()
    {
        return $this->belongsTo(ServiceEnCours::class, 'service_en_cours_id');
    }

    public function statut()
    {
        return $this->belongsTo(ServiceStatus::class, 'service_status_id');
    }

    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
