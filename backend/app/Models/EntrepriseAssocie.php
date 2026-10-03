<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Personne rattachée à une entreprise : gérant, associé, partenaire…
 * Voir la migration `create_entreprise_associes_table`.
 */
class EntrepriseAssocie extends Model
{
    /** Rôles proposés dans le formulaire, validés avec l'utilisatrice. */
    public const TYPES = [
        'Partenaire',
        'Gèrent',
        'Co-Gèrent',
        'Associé',
        'Gérant non Associé',
    ];

    protected $table = 'entreprise_associes';

    protected $fillable = [
        'entreprise_id', 'nom', 'cin', 'type',
        'adresse', 'telephone', 'telephone_2', 'email', 'ordre',
    ];

    public function entreprise()
    {
        return $this->belongsTo(Entreprise::class, 'entreprise_id', 'party_id');
    }
}
