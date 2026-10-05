<?php

namespace App\Http\Controllers\Api\V1;

use App\Contracts\Facturation\StatistiquesDocuments;
use App\Http\Controllers\Controller;
use App\Models\Cachet;
use App\Models\DataCenterFiche;
use App\Models\DeclarationTva;
use App\Models\Domiciliation;
use App\Models\Mail;
use App\Models\Paiement;
use App\Models\Party;
use App\Models\Rapport;
use App\Models\Service;
use App\Models\ServiceEnCours;
use Illuminate\Http\Request;

/**
 * Compteurs Archive / Corbeille, toutes catégories confondues, en UNE seule
 * requête HTTP — la page Archive chargeait jusqu'ici chaque catégorie
 * séparément (15 requêtes) et devait s'y prendre à la demande pour ne pas
 * dépasser le throttle de 60 req/min ; les compteurs n'étaient donc visibles
 * qu'après avoir déjà cliqué sur chaque catégorie. Un seul aller-retour
 * suffit maintenant à afficher tous les nombres dès l'ouverture de la page.
 */
class ArchiveController extends Controller
{
    public function __construct(private StatistiquesDocuments $documents)
    {
    }

    public function counts(Request $request)
    {
        $status = $request->query('status', 'archive');
        $documents = $this->documents->compterParType($status);

        return response()->json([
            'clients' => Party::where('type', 'client')->where('status', $status)->count(),
            'entreprises' => Party::where('type', 'entreprise')->where('status', $status)->count(),
            'domiciliation' => Domiciliation::where('status', $status)->count(),
            'services' => Service::where('status', $status)->count(),
            'services_en_cours' => ServiceEnCours::where('status', $status)->count(),
            'facture' => $documents['facture'],
            'devis' => $documents['devis'],
            'bl' => $documents['bl'],
            'avoir' => $documents['avoir'],
            'paiements' => Paiement::where('status', $status)->count(),
            'tva' => DeclarationTva::where('type', 'tva')->where('status', $status)->count(),
            'chiffre_affaire' => DeclarationTva::where('type', 'chiffre_affaire')->where('status', $status)->count(),
            'rapports' => Rapport::where('status', $status)->count(),
            'cachets' => Cachet::where('status', $status)->count(),
            'mails' => Mail::where('status', $status)->count(),
            'data_center' => DataCenterFiche::where('status', $status)->count(),
        ]);
    }
}
