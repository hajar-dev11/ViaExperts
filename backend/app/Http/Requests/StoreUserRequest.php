<?php

namespace App\Http\Requests;

use App\Rules\MotDePasseFort;
use Illuminate\Foundation\Http\FormRequest;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // déjà restreint par le middleware 'admin' sur la route
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:150'],
            'telephone' => ['nullable', 'string', 'max:30'],
            'email' => ['required', 'email', 'max:150', 'unique:users,email'],
            'password' => ['required', 'string', new MotDePasseFort],
            // Saisie libre (la colonne users.fonction fait 30 caractères) ; purement informatif, jamais lu par les autorisations.
            'fonction' => ['nullable', 'string', 'max:30'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['integer', 'exists:permissions,id'],
        ];
    }
}
