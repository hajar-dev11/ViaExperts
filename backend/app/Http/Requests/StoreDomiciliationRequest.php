<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDomiciliationRequest extends FormRequest
{
    /** L'autorisation est portée par le middleware `permission:` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'entreprise_id' => ['required', 'integer', 'exists:entreprises,party_id'],
            'centre_domiciliation_id' => ['required', 'integer', 'exists:centres_domiciliation,id'],

            'mois_payee' => ['nullable', 'integer', 'min:0', 'max:600'],
            'mois_gratuits' => ['nullable', 'integer', 'min:0', 'max:600'],

            'date_depart' => ['required', 'date'],
            'date_fin' => ['nullable', 'date', 'after_or_equal:date_depart'],

            'mode_paiement' => ['nullable', 'string', Rule::in(self::MODES_PAIEMENT)],
            'prix_par_mois' => ['nullable', 'numeric', 'min:0'],
            'prix_total' => ['nullable', 'numeric', 'min:0'],

            'signature_sur_facture' => ['nullable', 'boolean'],
            'date_facture' => ['nullable', 'date'],
            'date_paiement' => ['nullable', 'date'],
            'date_legalisation' => ['nullable', 'date'],

            'doc_facture' => ['nullable', 'boolean'],
            'doc_contrat' => ['nullable', 'boolean'],
            'doc_attestation' => ['nullable', 'boolean'],
            'doc_procuration' => ['nullable', 'boolean'],
        ];
    }

    /** Liste imposée par l'utilisateur pour le champ « Mode de paiement ». */
    public const MODES_PAIEMENT = [
        'Virement',
        'Chèque',
        'Traite',
        'Espèce',
        'Versement',
        'Carte bancaire',
        'Affacturage',
        'Crédit',
        'Autres à déterminer',
    ];
}
