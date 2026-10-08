<?php

/*
 * Processus enfant des tests de concurrence génériques (voir DomiciliationPeriodesTest).
 *
 * Il envoie `nombre` fois la MÊME requête JSON, via le noyau HTTP de l'application avec un jeton Sanctum, après avoir attendu
 * l'instant de départ commun : plusieurs processus identiques frappent ainsi le serveur au même moment (double-clic, deux onglets).
 *
 * Usage : php requetes_en_parallele.php <jeton> <methode> <uri> <corps_json_encode_base64> <instant_de_depart (microtime)> <nombre>
 * Sortie : une ligne JSON {"statuts": [...]}
 */

use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Http\Request;

[, $jeton, $methode, $uri, $corpsBase64, $depart, $nombre] = $argv;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(ConsoleKernel::class)->bootstrap(); // démarrage de l'application AVANT le top départ

while (microtime(true) < (float) $depart) {
    usleep(500);
}

$http = $app->make(HttpKernel::class);
$entetes = ['HTTP_ACCEPT' => 'application/json', 'HTTP_AUTHORIZATION' => "Bearer {$jeton}", 'CONTENT_TYPE' => 'application/json'];
$corps = base64_decode($corpsBase64);

$statuts = [];
for ($i = 0; $i < (int) $nombre; $i++) {
    $statuts[] = $http->handle(Request::create($uri, $methode, [], [], [], $entetes, $corps))->getStatusCode();
}

echo json_encode(['statuts' => $statuts])."\n";
