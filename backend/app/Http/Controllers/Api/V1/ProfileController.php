<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateProfileRequest;
use App\Support\ImageTeleversee;
use App\Support\SessionsUtilisateur;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function update(UpdateProfileRequest $request)
    {
        $user = $request->user();
        $data = $request->validated();

        $attributes = collect($data)->only(['name', 'telephone', 'email'])->toArray();
        if (! empty($data['password'])) {
            $attributes['password'] = Hash::make($data['password']);
        }

        $user->update($attributes);

        // Nouveau mot de passe : les autres sessions de ce compte sont déconnectées, celle-ci reste ouverte.
        if (! empty($data['password'])) {
            SessionsUtilisateur::apresChangementDeMotDePasse($user, $request);
        }

        return response()->json(['user' => $user->fresh()]);
    }

    public function uploadPhoto(Request $request)
    {
        $request->validate(['file' => ImageTeleversee::regles()], ImageTeleversee::messages());

        $user = $request->user();
        if ($user->photo_path) {
            Storage::disk('public')->delete($user->photo_path);
        }
        $user->update(['photo_path' => $request->file('file')->store('profiles', 'public')]);

        return response()->json(['user' => $user->fresh()]);
    }

    public function deletePhoto(Request $request)
    {
        $user = $request->user();
        if ($user->photo_path) {
            Storage::disk('public')->delete($user->photo_path);
        }
        $user->update(['photo_path' => null]);

        return response()->json(['user' => $user->fresh()]);
    }
}
