<?php

/*
 * Processus enfant des tests de concurrence de la numérotation (voir NumerotationConcurrenceTest).
 *
 * Il simule un utilisateur : demande le numéro proposé, puis crée un document avec CE numéro, exactement comme
 * le fait l'interface (DocumentForm). Plusieurs de ces processus démarrent au même instant.
 *
 * Usage : php creer_document_en_parallele.php <jeton> <party_id> <instant_de_depart (microtime)> [<documents_a_creer> [<reessayer 0|1>]]
 *   - sans les deux derniers arguments : UNE seule tentative (on observe la réponse brute d'une collision) ;
 *   - avec <reessayer>=1 : en cas de 422 (numéro pris), le processus redemande un numéro et recommence, jusqu'à avoir
 *     créé <documents_a_creer> documents (comportement d'un utilisateur qui réessaie).
 * Sortie : une ligne JSON {"propose": ..., "statut": ..., "statuts": [...], "erreurs": [...], "crees": n}
 */

use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Http\Request;

[, $jeton, $partyId, $depart] = $argv;
$cible = (int) ($argv[4] ?? 1);
$reessayer = ($argv[5] ?? '0') === '1';

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(ConsoleKernel::class)->bootstrap(); // démarrage de l'application AVANT le top départ

while (microtime(true) < (float) $depart) {
    usleep(500);
}

$http = $app->make(HttpKernel::class);
$entetes = ['HTTP_ACCEPT' => 'application/json', 'HTTP_AUTHORIZATION' => "Bearer {$jeton}", 'CONTENT_TYPE' => 'application/json'];

$statuts = [];
$erreurs = [];
$proposes = [];
$crees = 0;

for ($tentative = 0; $tentative < 80 && $crees < $cible; $tentative++) {
    // 1) numéro proposé
    $reponse = $http->handle(Request::create('/api/v1/facturation/facture/numero-propose', 'GET', ['emetteur' => 'bureau_comptabilite'], [], [], $entetes));
    $propose = json_decode($reponse->getContent(), true)['numero'] ?? null;
    $proposes[] = $propose;

    // 2) création avec ce numéro
    $corps = json_encode([
        'emetteur' => 'bureau_comptabilite',
        'party_id' => (int) $partyId,
        'numero' => $propose,
        'date_document' => '2026-10-05 10:00:00',
        'lignes' => [['designation' => 'Ligne concurrence', 'quantite' => 1, 'prix_unitaire' => 100]],
    ]);
    $reponse = $http->handle(Request::create('/api/v1/facturation/facture', 'POST', [], [], [], $entetes, $corps));
    $json = json_decode($reponse->getContent(), true);
    $statuts[] = $reponse->getStatusCode();

    if ($reponse->getStatusCode() === 201) {
        $crees++;
    } elseif ($reponse->getStatusCode() === 422) {
        $erreurs[] = array_keys($json['errors'] ?? []);
    } else {
        break; // erreur inattendue (ex. 500) : on s'arrête, le test la signalera
    }

    if (! $reessayer) {
        break;
    }
}

echo json_encode([
    'propose' => $proposes[0] ?? null,
    'statut' => $statuts[0] ?? null,
    'statuts' => $statuts,
    'erreurs' => $erreurs,
    'crees' => $crees,
])."\n";
