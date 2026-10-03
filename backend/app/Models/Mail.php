<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Mail extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'party_id', 'mail_status_id', 'date_depart', 'derniere_operation',
        'observation', 'status', 'created_by',
    ];

    protected $casts = [
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

    /** Statut issu de `mail_statuses` (Paramètres → Mail). */
    public function statut()
    {
        return $this->belongsTo(MailStatus::class, 'mail_status_id');
    }

    public function operations()
    {
        return $this->hasMany(MailOperation::class)->latest('id');
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
