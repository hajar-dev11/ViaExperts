<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Party extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'type',
        'status',
        'created_by',
    ];

    public function client()
    {
        return $this->hasOne(Client::class, 'party_id', 'id');
    }

    public function entreprise()
    {
        return $this->hasOne(Entreprise::class, 'party_id', 'id');
    }

    /** Membre du système (assistant ou administrateur) qui a créé la fiche. */
    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
