<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Document joint à une entreprise (bloc « Documents » de sa fiche). */
class EntrepriseDocument extends Model
{
    use SoftDeletes;

    protected $table = 'entreprise_documents';

    protected $fillable = [
        'entreprise_id', 'nom', 'chemin', 'mime', 'taille', 'status', 'uploaded_by',
    ];

    public function entreprise()
    {
        return $this->belongsTo(Entreprise::class, 'entreprise_id', 'party_id');
    }

    public function auteur()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }
}
