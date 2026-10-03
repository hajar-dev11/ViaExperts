<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Fichier extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'nom', 'chemin', 'mime', 'taille', 'created_by',
    ];

    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
