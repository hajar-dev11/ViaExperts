<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateDomiciliationSettingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // déjà restreint par le middleware 'admin' sur la route
    }

    public function rules(): array
    {
        return [
            'nom_societe' => ['nullable', 'string', 'max:150'],
            'gerant' => ['nullable', 'string', 'max:150'],
            'prix_domiciliation' => ['nullable', 'numeric', 'min:0'],
            'references_recu' => ['nullable', 'string', 'max:50'],
            'afficher_entreprise_info_recu' => ['boolean'],
            'ice_societe' => ['nullable', 'string', 'max:50'],
            'entreprise_info' => ['nullable', 'string'],
            'facture_prefixe' => ['nullable', 'string', 'max:20'],
            'facture_prochain_numero' => ['nullable', 'integer', 'min:0'],
            'facture_suffixe' => ['nullable', 'string', 'max:20'],
            'devis_prefixe' => ['nullable', 'string', 'max:20'],
            'devis_prochain_numero' => ['nullable', 'integer', 'min:0'],
            'devis_suffixe' => ['nullable', 'string', 'max:20'],
            'bl_prefixe' => ['nullable', 'string', 'max:20'],
            'bl_prochain_numero' => ['nullable', 'integer', 'min:0'],
            'bl_suffixe' => ['nullable', 'string', 'max:20'],
            'avoir_prefixe' => ['nullable', 'string', 'max:20'],
            'avoir_prochain_numero' => ['nullable', 'integer', 'min:0'],
            'avoir_suffixe' => ['nullable', 'string', 'max:20'],
        ];
    }
}
