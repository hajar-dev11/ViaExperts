<?php

/*
 * Processus enfant du test de concurrence de la numérotation (voir NumerotationConcurrenceTest).
 *
 * Il simule un utilisateur : demande le numéro proposé, puis crée un document avec CE numéro, exactement comme
 * le fait l'interface (DocumentForm). Plusieurs de ces processus démarrent au même instant.
 *
 * Usage : php creer_document_en_parallele.php <jeton> <party_id> <instant_de_depart (microtime)>
 * Sortie : une ligne JSON {"propose": ..., "statut": ..., "id": ...}
 */

use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Http\Request;

[, $jeton, $partyId, $depart] = $argv;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(ConsoleKernel::class)->bootstrap(); // démarrage de l'application AVANT le top départ

while (microtime(true) < (float) $depart) {
    usleep(500);
}

$http = $app->make(HttpKernel::class);
$entetes = ['HTTP_ACCEPT' => 'application/json', 'HTTP_AUTHORIZATION' => "Bearer {$jeton}", 'CONTENT_TYPE' => 'application/json'];

// 1) numéro proposé
$reponse = $http->handle(Request::create('/api/v1/facturation/facture/numero-propose', 'GET', ['emetteur' => 'bureau_comptabilite'], [], [], $entetes));
$propose = json_decode($reponse->getContent(), true)['numero'] ?? null;

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

echo json_encode(['propose' => $propose, 'statut' => $reponse->getStatusCode(), 'id' => $json['data']['id'] ?? null])."\n";
