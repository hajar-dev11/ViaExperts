<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Sert le logo / la signature des réglages (Bureau, Centre) via l'API.
 *
 * Les fichiers de `/storage` sont servis statiquement, sans en-têtes CORS : le
 * navigateur ne peut donc pas en lire les octets depuis le frontend. Pour générer
 * le PDF d'une facture (logo et signature intégrés), le frontend les récupère ici,
 * où `api/*` est couvert par la configuration CORS.
 */
class SettingFichierController extends Controller
{
    public function show(Request $request)
    {
        $path = (string) $request->query('path', '');

        // Uniquement les images des réglages — jamais un chemin arbitraire du disque.
        if (! preg_match('#^settings/(cabinet|domiciliation)/[A-Za-z0-9._-]+\.(jpe?g|png|gif)$#i', $path)
            || ! Storage::disk('public')->exists($path)) {
            abort(404);
        }

        return Storage::disk('public')->response($path);
    }
}
