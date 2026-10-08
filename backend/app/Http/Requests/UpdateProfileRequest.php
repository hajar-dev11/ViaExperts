<?php

namespace App\Http\Requests;

use App\Rules\MotDePasseFort;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // un utilisateur authentifié peut toujours modifier son propre profil
    }

    public function rules(): array
    {
        $id = $this->user()->id;

        return [
            'name' => ['required', 'string', 'max:150'],
            'telephone' => ['nullable', 'string', 'max:30'],
            'email' => ['required', 'email', 'max:150', Rule::unique('users', 'email')->ignore($id)],
            'current_password' => ['nullable', 'string'],
            'password' => ['nullable', 'string', new MotDePasseFort, 'confirmed'],
        ];
    }

    /** Vrai si la requête change l'adresse email du compte (comparaison insensible à la casse). */
    public function changeLEmail(): bool
    {
        return mb_strtolower(trim((string) $this->input('email'))) !== mb_strtolower((string) $this->user()->email);
    }

    /**
     * Changer le mot de passe OU l'adresse email (qui sert d'identifiant et de destinataire des liens de
     * réinitialisation) exige le mot de passe actuel : une session volée ne suffit plus à prendre le compte.
     */
    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if ($validator->errors()->has('email') || ! ($this->filled('password') || $this->changeLEmail())) {
                return;
            }

            if (! $this->filled('current_password')) {
                $validator->errors()->add('current_password', $this->filled('password')
                    ? 'Le mot de passe actuel est requis pour changer le mot de passe.'
                    : 'Le mot de passe actuel est requis pour changer l\'adresse email.');

                return;
            }

            if (! Hash::check((string) $this->input('current_password'), $this->user()->password)) {
                $validator->errors()->add('current_password', 'Mot de passe actuel incorrect.');
            }
        });
    }
}
