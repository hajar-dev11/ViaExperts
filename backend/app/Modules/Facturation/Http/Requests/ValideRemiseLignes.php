<?php

namespace App\Modules\Facturation\Http\Requests;

use Illuminate\Validation\Validator;

/**
 * Remise d'une ligne en MONTANT (Dh) : jamais supérieure au total HT de la ligne (quantité × prix unitaire).
 * Partagé par la création et la modification d'un document commercial.
 */
trait ValideRemiseLignes
{
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            foreach ((array) $this->input('lignes', []) as $i => $ligne) {
                $remise = $ligne['remise_montant'] ?? null;
                if ($remise === null || $remise === '' || ! is_numeric($remise)) {
                    continue;
                }

                $brut = (float) ($ligne['quantite'] ?? 0) * (float) ($ligne['prix_unitaire'] ?? 0);
                if ((float) $remise > $brut + 0.005) {
                    $v->errors()->add(
                        "lignes.{$i}.remise_montant",
                        sprintf('La remise de la ligne %d (%s Dh) ne peut pas dépasser son total HT (%s Dh).', $i + 1, number_format((float) $remise, 2, ',', ' '), number_format($brut, 2, ',', ' '))
                    );
                }
            }
        });
    }
}
