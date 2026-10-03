<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

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
    public static function assurerPourClient(string $nomService, ?int $clientId, int $creePar): void
    {
        if (! $clientId) {
            return;
        }

        $service = Service::where('nom', $nomService)->first();
        if (! $service) {
            return;
        }

        static::assurerService($service->id, $clientId, $creePar);
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
     */
    public static function assurerServicesPourTiers(?int $partyId, iterable $serviceIds, int $creePar): void
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
            static::assurerService($serviceId, (int) $clientId, $creePar);
        }
    }

    /**
     * Crée la ligne (service, client) si elle n'existe pas encore, quel que soit son statut
     * actif/archive/corbeille (une ligne supprimée définitivement peut être recréée).
     */
    private static function assurerService(int $serviceId, int $clientId, int $creePar): void
    {
        if (! Service::whereKey($serviceId)->exists()) {
            return;
        }

        static::firstOrCreate(
            ['service_id' => $serviceId, 'client_id' => $clientId],
            [
                'service_status_id' => static::statutParDefautId(),
                'date_depart' => now(),
                'derniere_operation' => now(),
                'created_by' => $creePar,
            ]
        );
    }
}
