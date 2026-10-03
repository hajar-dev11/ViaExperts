<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'telephone' => $this->telephone,
            'fonction' => $this->fonction,
            'isAdmin' => $this->is_admin,
            'permissions' => $this->when(
                $this->relationLoaded('userPermissions'),
                fn () => $this->userPermissions->pluck('permission_id')->values()
            ),
            'createdAt' => $this->created_at,
        ];
    }
}
