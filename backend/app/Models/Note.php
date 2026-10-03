<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Note extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'titre', 'contenu', 'created_by',
    ];

    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
