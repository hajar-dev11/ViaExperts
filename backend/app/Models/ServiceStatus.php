<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceStatus extends Model
{
    protected $fillable = ['nom', 'couleur_texte', 'couleur_fond'];
}
