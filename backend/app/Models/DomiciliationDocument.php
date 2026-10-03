<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DomiciliationDocument extends Model
{
    use SoftDeletes;

    protected $fillable = ['domiciliation_id', 'nom', 'chemin', 'mime', 'taille', 'uploaded_by', 'status'];

    protected $casts = ['taille' => 'integer'];

    public function domiciliation()
    {
        return $this->belongsTo(Domiciliation::class);
    }

    public function auteur()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
