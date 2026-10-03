<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreClientRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $phone = ['nullable', 'regex:/^(\+212|0)[5-7][0-9]{8}$/'];

        return [
            'genre' => ['required', 'in:Mr,Mme'],
            'nom' => ['required', 'string', 'max:150'],
            'nomAr' => ['nullable', 'string', 'max:150'],
            'nationalite' => ['nullable', 'string', 'max:80'],
            'naissance' => ['nullable', 'date'],
            'cin' => ['nullable', 'string', 'max:20', 'unique:clients,cin'],
            'email' => ['nullable', 'email', 'max:150', 'unique:clients,email'],
            'tel' => $phone,
            'tel2' => $phone,
            'adresse' => ['nullable', 'string', 'max:255'],
            'adresseAr' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'tel.regex' => 'Le téléphone doit être un numéro marocain valide (ex: 06 00 00 00 00 ou +212 6 00 00 00 00).',
            'tel2.regex' => 'Le téléphone 2 doit être un numéro marocain valide (ex: 06 00 00 00 00 ou +212 6 00 00 00 00).',
            'cin.unique' => 'Un client avec ce CIN existe déjà.',
            'email.unique' => 'Un client avec cet email existe déjà.',
        ];
    }
}
