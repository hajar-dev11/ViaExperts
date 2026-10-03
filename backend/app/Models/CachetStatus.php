<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CachetStatus extends Model
{
    protected $fillable = ['nom', 'couleur_texte', 'couleur_fond'];
}
