<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserPermission extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'permission_id', 'granted_by', 'granted_at'];

    protected $casts = [
        'granted_at' => 'datetime',
    ];

    public function permission()
    {
        return $this->belongsTo(Permission::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
