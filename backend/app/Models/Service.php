<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Service extends Model
{
    use SoftDeletes;

    protected $fillable = ['via_experts', 'maitre', 'nom', 'prix', 'description', 'status', 'created_by'];

    protected $casts = [
        'via_experts' => 'boolean',
        'prix' => 'decimal:2',
    ];

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }
}
