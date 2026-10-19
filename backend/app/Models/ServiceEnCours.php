<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Log;

class ServiceEnCours extends Model
{
    use SoftDeletes;

    protected $table = 'service_en_cours';

    protected $fillable = [
        'service_id', 'client_id', 'service_status_id',
        'date_depart', 'derniere_operation', 'status', 'created_by',
    ];

    protected $casts = [
        'date_depart' => 'datetime',
        'derniere_operation' => 'datetime',
    ];

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function client()
    {
        return $this->belongsTo(Client::class, 'client_id', 'party_id');
    }

    public function statut()
    {
        return $this->belongsTo(ServiceStatus::class, 'service_status_id');
    }

    public function operations()
    {
        return $this->hasMany(ServiceEnCoursOperation::class, 'service_en_cours_id')->latest('id');
    }

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    /** Statut « business » (service_status_id) à poser par défaut sur un nouveau service en cours. */
    public static function statutParDefautId(): ?int
    {
        return ServiceStatus::where('nom', 'En Attente')->value('id');
    }

    /**
     * Garantit qu'un client a bien un « Service en cours » pour un service du
     * catalogue donné (par son nom) — crée la ligne si elle n'existe pas encore,
     * ne fait rien si elle existe déjà (pas de doublon, quel que soit son statut
     * actif/archive/corbeille). Utilisé pour qu'une action métier (ex. déposer
     * une Déclaration TVA) fasse apparaître automatiquement le service concerné
     * dans « Services en cours », sans dépendre d'une saisie manuelle.
     */
    public static function assurerPourClient(string $nomService, ?int $clientId, int $creePar, array $source = []): void
    {
        if (! $clientId) {
            return;
        }

        $service = Service::where('nom', $nomService)->first();
        if (! $service) {
            return;
        }

        static::assurerService($service->id, $clientId, $creePar, $source);
    }

    /**
     * Fait apparaître dans « Services en cours » les services réellement saisis sur les lignes d'une
     * Facture, d'un Devis, d'un Bon de livraison, d'une Facture d'avoir ou d'un Paiement.
     *
     * `$partyId` est le tiers du document : un client, ou une entreprise (on retient alors son client
     * titulaire). Une seule ligne « service en cours » par couple (service, client) — c'est la même
     * table que celle de la page « Services en cours », aucune liste parallèle. Un service déjà
     * présent n'est pas touché : son statut et son historique d'opérations restent ceux de la page.
     *
     * @param  iterable<int|null>  $serviceIds  `service_id` des lignes (les lignes libres, sans service, sont ignorées)
     * @param  array{type?: string, id?: int, fichier_nom?: ?string, fichier_chemin?: ?string}  $source  document d'origine (voir assurerService)
     */
    public static function assurerServicesPourTiers(?int $partyId, iterable $serviceIds, int $creePar, array $source = []): void
    {
        if (! $partyId) {
            return;
        }

        $clientId = Client::where('party_id', $partyId)->value('party_id')
            ?? Entreprise::where('party_id', $partyId)->value('client_id');
        if (! $clientId) {
            return;
        }

        foreach (collect($serviceIds)->filter()->map(fn ($id) => (int) $id)->unique() as $serviceId) {
            static::assurerService($serviceId, (int) $clientId, $creePar, $source);
        }
    }

    /**
     * Crée la ligne (service, client) si elle n'existe pas encore, quel que soit son statut
     * actif/archive/corbeille (une ligne supprimée définitivement peut être recréée).
     *
     * Une ligne NOUVELLE enregistre aussitôt son activité de création (fil « Activité Services ») : statut par défaut, auteur,
     * date et heure réels, et le document d'origine avec sa pièce jointe quand il en a une. Une ligne déjà présente n'en
     * produit aucune : enregistrer, modifier ou recharger un document ne duplique jamais l'activité.
     *
     * Si le statut « En Attente » n'existe pas au catalogue, la ligne est quand même créée (le document, lui, est valide) mais
     * SANS statut, et l'anomalie est journalisée ; l'écran Services en cours la signale.
     *
     * @param  array{type?: string, id?: int, fichier_nom?: ?string, fichier_chemin?: ?string}  $source  document à l'origine
     */
    private static function assurerService(int $serviceId, int $clientId, int $creePar, array $source = []): void
    {
        if (! Service::whereKey($serviceId)->exists()) {
            return;
        }

        $statutId = static::statutParDefautId();

        $ligne = static::firstOrCreate(
            ['service_id' => $serviceId, 'client_id' => $clientId],
            [
                'service_status_id' => $statutId,
                'date_depart' => now(),
                'derniere_operation' => now(),
                'created_by' => $creePar,
            ]
        );

        if (! $ligne->wasRecentlyCreated) {
            return;
        }

        if ($statutId === null) {
            Log::warning('Service en cours créé sans statut : le statut « En Attente » n\'existe pas dans Paramètres → Services.', [
                'service_en_cours_id' => $ligne->id, 'service_id' => $serviceId, 'client_id' => $clientId,
            ]);
        }

        ServiceEnCoursOperation::enregistrer([
            'service_en_cours_id' => $ligne->id,
            'action' => ServiceEnCoursOperation::ACTION_CREATION,
            'service_status_id' => $statutId,
            'source_type' => $source['type'] ?? null,
            'source_id' => $source['id'] ?? null,
            'source_fichier_nom' => $source['fichier_nom'] ?? null,
            'source_fichier_chemin' => $source['fichier_chemin'] ?? null,
            'created_by' => $creePar,
        ]);
    }
}
