<?php

namespace App\Modules\Domiciliation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

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

            'mode_paiement' => self::reglesModePaiement(),
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

    /** Préfixe d'un mode précisé à la main quand « Autres à déterminer » est choisi (« Autre : Mandat »). */
    public const PREFIXE_AUTRE = 'Autre : ';

    /**
     * Règles du « Mode de paiement » : un mode de la liste imposée, OU « Autre : <précision saisie> » (précision non vide,
     * 32 caractères au plus) quand l'utilisateur a choisi « Autres à déterminer » et précisé le mode. Tout autre texte est refusé.
     */
    public static function reglesModePaiement(bool $partiel = false): array
    {
        return array_values(array_filter([
            $partiel ? 'sometimes' : null,
            'nullable',
            'string',
            function (string $attribute, mixed $value, \Closure $fail) {
                if (in_array($value, self::MODES_PAIEMENT, true)) {
                    return;
                }
                if (is_string($value) && str_starts_with($value, self::PREFIXE_AUTRE)) {
                    $precision = trim(substr($value, strlen(self::PREFIXE_AUTRE)));
                    if ($precision !== '' && mb_strlen($precision) <= 32 && ! preg_match('/[\x00-\x1F\x7F<>]/u', $precision)) {
                        return;
                    }
                }
                $fail('Le mode de paiement sélectionné est invalide.');
            },
        ]));
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
