<?php

namespace App\Http\Requests;

use App\Rules\MotDePasseFort;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // déjà restreint par le middleware 'admin' sur la route
    }

    public function rules(): array
    {
        $id = $this->route('user');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:150'],
            'telephone' => ['nullable', 'string', 'max:30'],
            'email' => ['sometimes', 'required', 'email', 'max:150', Rule::unique('users', 'email')->ignore($id)],
            'password' => ['nullable', 'string', new MotDePasseFort],
            // Saisie libre (la colonne users.fonction fait 30 caractères) ; purement informatif, jamais lu par les autorisations.
            'fonction' => ['nullable', 'string', 'max:30'],
        ];
    }
}
