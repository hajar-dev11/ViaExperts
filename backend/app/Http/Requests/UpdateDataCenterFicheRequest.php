<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateDataCenterFicheRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // déjà restreint par 'permission:data_center,modifier' sur la route
    }

    public function rules(): array
    {
        return [
            'denomination' => ['sometimes', 'required', 'string', 'max:200'],
            'ice' => ['sometimes', 'required', 'string', 'max:20'],
            'if' => ['nullable', 'string', 'max:20'],
            'rc' => ['nullable', 'string', 'max:30'],
            'tp' => ['nullable', 'string', 'max:20'],
        ];
    }
}
