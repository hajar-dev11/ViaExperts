<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Cachet extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'party_id', 'cachet_status_id', 'lignes',
        'date_depart', 'derniere_operation', 'status', 'created_by',
    ];

    protected $casts = [
        'lignes' => 'integer',
        'date_depart' => 'datetime',
        'derniere_operation' => 'datetime',
    ];

    public function party()
    {
        return $this->belongsTo(Party::class);
    }

    public function client()
    {
        return $this->belongsTo(Client::class, 'party_id', 'party_id');
    }

    public function entreprise()
    {
        return $this->belongsTo(Entreprise::class, 'party_id', 'party_id');
    }

    /** Statut issu de `cachet_statuses` (Paramètres → Cachet). */
    public function statut()
    {
        return $this->belongsTo(CachetStatus::class, 'cachet_status_id');
    }

    public function operations()
    {
        return $this->hasMany(CachetOperation::class)->latest('id');
    }

    public function getTiersNomAttribute(): ?string
    {
        return $this->entreprise->denomination ?? $this->client->nom ?? null;
    }

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }
}
