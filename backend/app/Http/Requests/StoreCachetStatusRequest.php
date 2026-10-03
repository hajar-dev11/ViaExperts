<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCachetStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // déjà restreint par le middleware 'admin' sur la route
    }

    public function rules(): array
    {
        return [
            'nom' => ['required', 'string', 'max:100', 'unique:cachet_statuses,nom'],
            'couleur_texte' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'couleur_fond' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ];
    }
}
