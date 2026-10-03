<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreDataCenterFicheRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // déjà restreint par 'permission:data_center,ajouter' sur la route
    }

    /**
     * Dénomination et ICE sont obligatoires (identifiants clés d'une fiche) ;
     * R_C et TP_NUMBER restent facultatifs — la capture image68 montre des
     * lignes dont R_C et TP_NUMBER sont vides. Aucune règle d'unicité n'est inventée.
     */
    public function rules(): array
    {
        return [
            'denomination' => ['required', 'string', 'max:200'],
            'ice' => ['required', 'string', 'max:20'],
            'if' => ['nullable', 'string', 'max:20'],
            'rc' => ['nullable', 'string', 'max:30'],
            'tp' => ['nullable', 'string', 'max:20'],
        ];
    }
}
