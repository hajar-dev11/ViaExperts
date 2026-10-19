<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Models\UserPermission;
use App\Support\SessionsUtilisateur;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

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

        // Mot de passe modifié par l'administrateur : les sessions ouvertes de ce compte (volées ou non) sont fermées.
        if (! empty($data['password'])) {
            SessionsUtilisateur::apresChangementDeMotDePasse($user, $request);
        }

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

        // Tout ce qui appartient à CE compte — et rien d'autre — part avec lui, dans une seule transaction :
        //  - ses autorisations (user_permissions.user_id : cascade en base, supprimées ici explicitement pour que le
        //    comportement ne dépende pas du seul moteur) ;
        //  - ses jetons d'accès API (personal_access_tokens n'a pas de clé étrangère : sans cela ils resteraient orphelins) ;
        //  - ses demandes de réinitialisation de mot de passe (clé : e-mail) ;
        //  - sa photo de profil ;
        //  - ses messages de chat (envoyés ou reçus : cascade en base, discussion qui n'a plus de sens sans lui).
        // Ce qui est PARTAGÉ est conservé : les autorisations des autres comptes, y compris celles que ce compte avait
        // accordées (user_permissions.granted_by passe à NULL), et les documents/opérations qu'il a créés (created_by passe à NULL).
        $photo = $user->photo_path;

        DB::transaction(function () use ($user) {
            $user->userPermissions()->delete();
            $user->tokens()->delete();

            if (Schema::hasTable('password_reset_tokens')) {
                DB::table('password_reset_tokens')->where('email', $user->email)->delete();
            }

            $user->delete();
        });

        if ($photo) {
            Storage::disk('public')->delete($photo);
        }

        return response()->json(['message' => 'Utilisateur supprimé.']);
    }
}
