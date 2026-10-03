<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCentreDomiciliationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // déjà restreint par le middleware 'admin' sur la route
    }

    public function rules(): array
    {
        $id = $this->route('centre');

        return [
            'nom' => ['required', 'string', 'max:150', Rule::unique('centres_domiciliation', 'nom')->ignore($id)],
            'if' => ['nullable', 'string', 'max:20'],
            'ice' => ['nullable', 'string', 'max:20'],
            'ville' => ['nullable', 'string', 'max:80'],
            'adresse' => ['nullable', 'string', 'max:255'],
            'numero_archive' => ['nullable', 'string', 'max:50'],
            'telephone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:150'],
        ];
    }
}
