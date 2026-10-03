<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EntrepriseSecteur extends Model
{
    public $timestamps = false;

    protected $fillable = ['entreprise_id', 'secteur', 'activite', 'ordre'];
}
