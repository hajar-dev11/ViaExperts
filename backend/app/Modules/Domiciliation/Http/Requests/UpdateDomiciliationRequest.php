<?php

namespace App\Modules\Domiciliation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateDomiciliationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'entreprise_id' => ['sometimes', 'integer', 'exists:entreprises,party_id'],
            'centre_domiciliation_id' => ['sometimes', 'integer', 'exists:centres_domiciliation,id'],

            'mois_payee' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:600'],
            'mois_gratuits' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:600'],

            'date_depart' => ['sometimes', 'date'],
            'date_fin' => ['sometimes', 'nullable', 'date', 'after_or_equal:date_depart'],

            'mode_paiement' => StoreDomiciliationRequest::reglesModePaiement(true),
            'prix_par_mois' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'prix_total' => ['sometimes', 'nullable', 'numeric', 'min:0'],

            'signature_sur_facture' => ['sometimes', 'boolean'],
            'date_facture' => ['sometimes', 'nullable', 'date'],
            'date_paiement' => ['sometimes', 'nullable', 'date'],
            'date_legalisation' => ['sometimes', 'nullable', 'date'],

            'doc_facture' => ['sometimes', 'boolean'],
            'doc_contrat' => ['sometimes', 'boolean'],
            'doc_attestation' => ['sometimes', 'boolean'],
            'doc_procuration' => ['sometimes', 'boolean'],
        ];
    }
}
