<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CentreDomiciliation extends Model
{
    use SoftDeletes;

    protected $table = 'centres_domiciliation';

    protected $fillable = ['nom', 'if', 'ice', 'ville', 'adresse', 'numero_archive', 'telephone', 'email', 'status'];

    /** Entreprises domiciliées dans ce centre, toutes périodes confondues. */
    public function domiciliations()
    {
        return $this->hasMany(Domiciliation::class, 'centre_domiciliation_id');
    }

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }
}
