<?php

namespace App\Modules\Facturation\Http\Requests;

use App\Modules\Facturation\Models\DocumentCommercial;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDocumentCommercialRequest extends FormRequest
{
    use ValideRemiseLignes;

    /** L'autorisation est faite dans le contrôleur (permission dépendante du type). */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $type = $this->route('type');

        return [
            'emetteur' => ['required', Rule::in(DocumentCommercial::EMETTEURS)],
            'responsable' => ['nullable', 'string', 'max:150'],
            'party_id' => ['required', 'integer', 'exists:parties,id'],
            // `numero_auto` : le numéro affiché est celui proposé par la numérotation de l'émetteur et n'a pas été modifié à la main.
            // Le serveur attribue alors lui-même le numéro libre suivant, sous verrou (voir NumerotationDocuments::attribuer) :
            // deux créations simultanées n'obtiennent jamais le même numéro. Un numéro saisi à la main reste contrôlé (unicité).
            'numero_auto' => ['nullable', 'boolean'],
            'numero' => $this->boolean('numero_auto')
                ? ['nullable', 'string', 'max:60']
                : [
                    'required', 'string', 'max:60',
                    Rule::unique('documents_commerciaux', 'numero')->where(fn ($q) => $q->where('type', $type)),
                ],

            'date_document' => ['required', 'date'],
            'date_paiement' => ['nullable', 'date'],
            'date_credit' => ['nullable', 'date'],
            'mode_paiement' => ['nullable', 'string', 'max:40'],
            'signature' => ['nullable', 'boolean'],
            'note' => ['nullable', 'string', 'max:5000'],

            // Option C validée : saisissable à la création, puis maintenu par les paiements.
            'prix_paye' => ['nullable', 'numeric', 'min:0'],

            'lignes' => ['required', 'array', 'min:1'],
            'lignes.*.service_id' => ['nullable', 'integer', 'exists:services,id'],
            'lignes.*.designation' => ['required', 'string', 'max:255'],
            'lignes.*.quantite' => ['required', 'integer', 'min:0'],
            'lignes.*.prix_unitaire' => ['required', 'numeric', 'min:0'],
            // Remise en MONTANT (Dh), plafonnée au total HT de la ligne (voir ValideRemiseLignes). remise_pourcent reste accepté
            // pour les clients API existants ; les écrans n'envoient plus que le montant.
            'lignes.*.remise_montant' => ['nullable', 'numeric', 'min:0'],
            'lignes.*.remise_pourcent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lignes.*.tva_pourcent' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'numero.unique' => 'Ce numéro est déjà utilisé par un document du même type.',
            'lignes.required' => 'Le document doit comporter au moins une ligne.',
            'lignes.*.quantite.integer' => 'La quantité doit être un nombre entier (sans virgule).',
            'lignes.*.remise_montant.numeric' => 'La remise doit être un montant en Dh.',
            'lignes.*.remise_montant.min' => 'La remise ne peut pas être négative.',
        ];
    }
}
