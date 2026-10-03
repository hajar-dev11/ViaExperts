<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateUserPermissionsRequest;
use App\Http\Resources\UserResource;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Illuminate\Support\Facades\DB;

class PermissionController extends Controller
{
    public function index()
    {
        return Permission::orderBy('module')->orderBy('action')->get(['id', 'module', 'action']);
    }

    public function showForUser(User $user)
    {
        return $user->userPermissions()->with('permission')->get()->map(fn ($up) => [
            'permissionId' => $up->permission_id,
            'module' => $up->permission->module,
            'action' => $up->permission->action,
        ]);
    }

    public function updateForUser(UpdateUserPermissionsRequest $request, User $user)
    {
        $permissionIds = $request->validated()['permissions'];

        DB::transaction(function () use ($user, $permissionIds, $request) {
            UserPermission::where('user_id', $user->id)->delete();

            foreach ($permissionIds as $permissionId) {
                UserPermission::create([
                    'user_id' => $user->id,
                    'permission_id' => $permissionId,
                    'granted_by' => $request->user()->id,
                    'granted_at' => now(),
                ]);
            }
        });

        return new UserResource($user->load('userPermissions'));
    }
}
