<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MailOperation extends Model
{
    protected $fillable = [
        'mail_id', 'mail_status_id', 'commentaire',
        'fichier_nom', 'fichier_chemin', 'created_by',
    ];

    public function mail()
    {
        return $this->belongsTo(Mail::class);
    }

    public function statut()
    {
        return $this->belongsTo(MailStatus::class, 'mail_status_id');
    }

    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
