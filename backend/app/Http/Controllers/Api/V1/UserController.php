<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Models\UserPermission;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index()
    {
        $users = User::with('userPermissions')->orderBy('name')->get();

        return UserResource::collection($users);
    }

    public function show(User $user)
    {
        return new UserResource($user->load('userPermissions'));
    }

    public function store(StoreUserRequest $request)
    {
        $data = $request->validated();

        $user = DB::transaction(function () use ($data, $request) {
            $user = User::create([
                'name' => $data['name'],
                'telephone' => $data['telephone'] ?? null,
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
                'fonction' => $data['fonction'] ?? null,
                'is_admin' => false, // un compte créé via ce formulaire n'est jamais admin
            ]);

            foreach ($data['permissions'] ?? [] as $permissionId) {
                UserPermission::create([
                    'user_id' => $user->id,
                    'permission_id' => $permissionId,
                    'granted_by' => $request->user()->id,
                    'granted_at' => now(),
                ]);
            }

            return $user;
        });

        return new UserResource($user->load('userPermissions'));
    }

    public function update(UpdateUserRequest $request, User $user)
    {
        $data = $request->validated();

        $attributes = collect($data)->except(['password'])->toArray();
        if (! empty($data['password'])) {
            $attributes['password'] = Hash::make($data['password']);
        }

        $user->update($attributes);

        return new UserResource($user->load('userPermissions'));
    }

    public function destroy(User $user)
    {
        $requester = request()->user();

        if ($requester->id === $user->id) {
            return response()->json(['message' => 'Vous ne pouvez pas supprimer votre propre compte.'], 422);
        }

        if ($user->is_admin && User::where('is_admin', true)->count() <= 1) {
            return response()->json(['message' => 'Impossible de supprimer le dernier administrateur.'], 422);
        }

        $user->delete();

        return response()->json(['message' => 'Utilisateur supprimé.']);
    }
}
