<?php

/*
 * Processus enfant du test de concurrence des paiements (voir PaiementConcurrenceTest).
 *
 * Il simule un utilisateur qui enregistre des paiements de 100 sur une même facture, via le noyau HTTP de
 * l'application avec un jeton Sanctum. Plusieurs de ces processus démarrent au même instant.
 *
 * Usage : php creer_paiements_en_parallele.php <jeton> <party_id> <document_id> <instant_de_depart (microtime)> <nombre>
 * Sortie : une ligne JSON {"statuts": [...]}
 */

use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Http\Request;

[, $jeton, $partyId, $documentId, $depart, $nombre] = $argv;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(ConsoleKernel::class)->bootstrap(); // démarrage de l'application AVANT le top départ

while (microtime(true) < (float) $depart) {
    usleep(500);
}

$http = $app->make(HttpKernel::class);
$entetes = ['HTTP_ACCEPT' => 'application/json', 'HTTP_AUTHORIZATION' => "Bearer {$jeton}", 'CONTENT_TYPE' => 'application/json'];

$statuts = [];
for ($i = 0; $i < (int) $nombre; $i++) {
    $corps = json_encode([
        'emetteur' => 'bureau_comptabilite',
        'responsable' => 'Maitre : Morad Bendeq',
        'party_id' => (int) $partyId,
        'document_id' => (int) $documentId,
        'date_operation' => '2026-10-06 10:00:00',
        'mode_paiement' => 'Espèce',
        'prix_paye' => 100,
        'lignes' => [['designation' => 'Paiement concurrence', 'quantite' => 1, 'prix_unitaire' => 100]],
    ]);
    $statuts[] = $http->handle(Request::create('/api/v1/paiements', 'POST', [], [], [], $entetes, $corps))->getStatusCode();
}

echo json_encode(['statuts' => $statuts])."\n";
