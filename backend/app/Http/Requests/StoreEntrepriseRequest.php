<?php

namespace App\Http\Requests;

use App\Models\Entreprise;
use App\Models\EntrepriseAssocie;
use App\Rules\DenominationEntrepriseUnique;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreEntrepriseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'denomination' => ['required', 'string', 'max:200', new DenominationEntrepriseUnique()],
            'tribunal' => ['nullable', 'string', 'max:150'],
            'forme' => ['required', 'in:SARL,SARL AU,SA,SNC,Auto-Entrepreneur,Établissement Public'],
            'ice' => ['nullable', 'string', 'max:20', Rule::unique('entreprises', 'ice')],
            'rc' => ['nullable', 'string', 'max:30'],
            'if' => ['nullable', 'string', 'max:20', Rule::unique('entreprises', 'if')],
            'tp' => ['nullable', 'string', 'max:20'],
            'cnss' => ['nullable', 'string', 'max:20'],
            'dateDebut' => ['nullable', 'date'],
            'capital' => ['nullable', 'numeric', 'min:0'],
            'single' => ['nullable', 'string', 'max:150'],
            'periode' => ['required', 'in:Mensuel,Trimestriel,Annuel'],
            'local' => ['nullable', 'in:Contrat de domiciliation,Contrat de bail,Attestation de propriété'],
            'centreDomiciliation' => ['nullable', 'string', 'max:150'],
            'numDossier' => ['nullable', 'string', 'max:50'],
            'numArchive' => ['nullable', 'string', 'max:50'],
            'observation' => ['nullable', 'string'],
            'client' => ['nullable', 'string', 'max:150'],
            'secteurs' => ['nullable', 'array'],
            'secteurs.*.secteur' => ['nullable', 'string', 'max:100'],
            'secteurs.*.activite' => ['nullable', 'string', 'max:200'],
            'associes' => ['nullable', 'array'],
            'associes.*.nom' => ['nullable', 'string', 'max:150'],
            'associes.*.cin' => ['nullable', 'string', 'max:30'],
            'associes.*.type' => ['nullable', Rule::in(EntrepriseAssocie::TYPES)],
            'associes.*.adresse' => ['nullable', 'string', 'max:255'],
            'associes.*.telephone' => ['nullable', 'string', 'max:30'],
            'associes.*.telephone2' => ['nullable', 'string', 'max:30'],
            'associes.*.email' => ['nullable', 'email', 'max:150'],
        ];
    }

    public function messages(): array
    {
        return [
            'ice.unique' => 'Une entreprise avec cet I.C.E existe déjà.',
            'if.unique' => 'Une entreprise avec cet Identifiant Fiscal existe déjà.',
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $tribunal = $this->input('tribunal');
            $rc = $this->input('rc');
            if ($tribunal && $rc) {
                $exists = Entreprise::where('tribunal', $tribunal)
                    ->where('rc', $rc)
                    ->when($this->route('entreprise'), fn ($q, $entreprise) => $q->where('party_id', '!=', $entreprise->party_id))
                    ->exists();
                if ($exists) {
                    $validator->errors()->add('rc', 'Une entreprise avec ce Registre de Commerce existe déjà pour ce tribunal.');
                }
            }
        });
    }
}
