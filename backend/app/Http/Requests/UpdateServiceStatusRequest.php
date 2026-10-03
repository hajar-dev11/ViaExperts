<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateServiceStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // déjà restreint par le middleware 'admin' sur la route
    }

    public function rules(): array
    {
        $id = $this->route('serviceStatus');

        return [
            'nom' => ['required', 'string', 'max:100', Rule::unique('service_statuses', 'nom')->ignore($id)],
            'couleur_texte' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'couleur_fond' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ];
    }
}
