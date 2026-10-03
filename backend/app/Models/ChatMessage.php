<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ChatMessage extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'sender_id', 'recipient_id', 'body', 'read_at',
        'fichier_nom', 'fichier_chemin', 'fichier_mime', 'fichier_taille',
    ];

    protected $casts = ['read_at' => 'datetime', 'fichier_taille' => 'integer'];

    public function sender()
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function recipient()
    {
        return $this->belongsTo(User::class, 'recipient_id');
    }

    /** Messages échangés entre deux utilisateurs, dans les deux sens. */
    public function scopeConversation($query, int $userA, int $userB)
    {
        return $query->where(function ($q) use ($userA, $userB) {
            $q->where('sender_id', $userA)->where('recipient_id', $userB);
        })->orWhere(function ($q) use ($userA, $userB) {
            $q->where('sender_id', $userB)->where('recipient_id', $userA);
        });
    }
}
