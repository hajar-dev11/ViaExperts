<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Client extends Model
{
    use HasFactory;

    protected $primaryKey = 'party_id';
    public $incrementing = false;
    public $timestamps = false; // les horodatages vivent sur `parties`, pas sur `clients`

    protected $fillable = [
        'party_id',
        'type',
        'genre',
        'nom',
        'nom_ar',
        'nationalite',
        'date_naissance',
        'cin',
        'email',
        'telephone',
        'telephone_2',
        'adresse',
        'adresse_ar',
    ];

    protected $casts = [
        'date_naissance' => 'date',
    ];

    public function party()
    {
        return $this->belongsTo(Party::class, 'party_id', 'id');
    }

    /**
     * Entreprises dont ce client est le titulaire (`entreprises.client_id`).
     * Un client peut être rattaché à plusieurs entreprises ; alimente le bloc
     * « Entreprise » de la page Informations Client.
     */
    public function entreprises()
    {
        return $this->hasMany(Entreprise::class, 'client_id', 'party_id');
    }

    public function scopeWithStatus($query, string $status)
    {
        return $query->whereHas('party', fn ($q) => $q->where('status', $status));
    }
}
