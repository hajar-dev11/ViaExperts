<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DataCenterFiche extends Model
{
    use SoftDeletes;

    protected $table = 'data_center_fiches';

    protected $fillable = [
        'denomination', 'ice', 'if', 'rc', 'tp', 'status', 'created_by',
    ];

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }
}
