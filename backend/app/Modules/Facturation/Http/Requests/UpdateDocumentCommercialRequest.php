<?php

namespace App\Modules\Facturation\Http\Requests;

use App\Modules\Facturation\Models\DocumentCommercial;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateDocumentCommercialRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $type = $this->route('type');
        $id = $this->route('document')->id ?? null;

        return [
            'emetteur' => ['sometimes', Rule::in(DocumentCommercial::EMETTEURS)],
            'responsable' => ['sometimes', 'nullable', 'string', 'max:150'],
            'party_id' => ['sometimes', 'integer', 'exists:parties,id'],
            'numero' => [
                'sometimes', 'string', 'max:60',
                Rule::unique('documents_commerciaux', 'numero')
                    ->where(fn ($q) => $q->where('type', $type))
                    ->ignore($id),
            ],

            'date_document' => ['sometimes', 'date'],
            'date_paiement' => ['sometimes', 'nullable', 'date'],
            'date_credit' => ['sometimes', 'nullable', 'date'],
            'mode_paiement' => ['sometimes', 'nullable', 'string', 'max:40'],
            'signature' => ['sometimes', 'boolean'],
            'note' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'prix_paye' => ['sometimes', 'numeric', 'min:0'],

            'lignes' => ['sometimes', 'array', 'min:1'],
            'lignes.*.service_id' => ['nullable', 'integer', 'exists:services,id'],
            'lignes.*.designation' => ['required_with:lignes', 'string', 'max:255'],
            'lignes.*.quantite' => ['required_with:lignes', 'numeric', 'min:0'],
            'lignes.*.prix_unitaire' => ['required_with:lignes', 'numeric', 'min:0'],
            'lignes.*.remise_pourcent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lignes.*.tva_pourcent' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }
}
