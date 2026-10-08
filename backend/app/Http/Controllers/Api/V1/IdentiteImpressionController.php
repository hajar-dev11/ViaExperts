<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CabinetSetting;
use App\Models\DomiciliationSetting;

/**
 * Identité de l'émetteur nécessaire à l'IMPRESSION des documents (factures, devis, reçus, documents de domiciliation).
 *
 * Les routes `/settings/cabinet` et `/settings/domiciliation` exposent TOUTE la configuration (numérotation, ICE, prix…)
 * et restent réservées à la permission Paramètres. Cette route-ci ne renvoie que les six champs qui apparaissent sur
 * un document imprimé — déjà visibles sur chaque PDF émis — et reste accessible à tout utilisateur autorisé à imprimer
 * (middleware `impression`), sans lui donner aucun droit Paramètres.
 */
class IdentiteImpressionController extends Controller
{
    /** `via_experts` = Centre de domiciliation ; `bureau` = Bureau de comptabilité. */
    public function show(string $emetteur)
    {
        abort_unless(in_array($emetteur, ['via_experts', 'bureau'], true), 404);

        $reglages = $emetteur === 'via_experts' ? DomiciliationSetting::firstOrCreate([]) : CabinetSetting::firstOrCreate([]);

        return response()->json([
            'nom_societe' => $reglages->nom_societe,
            'logo_path' => $reglages->logo_path,
            'signature_path' => $reglages->signature_path,
            'gerant' => $reglages->gerant ?? null,
            'entreprise_info' => $reglages->entreprise_info,
            'afficher_entreprise_info_recu' => (bool) $reglages->afficher_entreprise_info_recu,
        ]);
    }
}