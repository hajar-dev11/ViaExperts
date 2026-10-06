<?php

namespace App\Modules\Domiciliation\Models;

use App\Models\Entreprise;
use App\Models\User;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Domiciliation extends Model
{
    use SoftDeletes;

    /**
     * Seuil de passage en « Alerte » : nombre de jours avant `date_fin`.
     *
     * ⚠️ HYPOTHÈSE À CONFIRMER — cette valeur n'a pas été spécifiée par l'utilisateur.
     * 30 jours est une valeur par défaut explicite, pas une règle métier validée.
     * Si la règle réelle diffère, c'est la seule constante à changer.
     */
    public const JOURS_ALERTE = 30;

    protected $fillable = [
        'entreprise_id',
        'centre_domiciliation_id',
        'mois_payee',
        'mois_gratuits',
        'date_depart',
        'date_fin',
        'mode_paiement',
        'prix_par_mois',
        'prix_total',
        'signature_sur_facture',
        'date_facture',
        'date_paiement',
        'date_legalisation',
        'doc_facture',
        'doc_contrat',
        'doc_attestation',
        'doc_procuration',
        'etat',
        'status',
        'date_resiliation',
        'date_declaration',
        'renouvelle_de_id',
        'created_by',
    ];

    protected $casts = [
        'date_depart' => 'date',
        'date_fin' => 'date',
        'date_facture' => 'date',
        'date_paiement' => 'date',
        'date_legalisation' => 'date',
        'date_resiliation' => 'date',
        'date_declaration' => 'date',
        'prix_par_mois' => 'decimal:2',
        'prix_total' => 'decimal:2',
        'signature_sur_facture' => 'boolean',
        'doc_facture' => 'boolean',
        'doc_contrat' => 'boolean',
        'doc_attestation' => 'boolean',
        'doc_procuration' => 'boolean',
        'mois_payee' => 'integer',
        'mois_gratuits' => 'integer',
    ];

    protected $appends = ['statut_affichage'];

    public function entreprise()
    {
        return $this->belongsTo(Entreprise::class, 'entreprise_id', 'party_id');
    }

    public function centre()
    {
        return $this->belongsTo(CentreDomiciliation::class, 'centre_domiciliation_id');
    }

    public function observations()
    {
        return $this->hasMany(DomiciliationObservation::class)->latest('id');
    }

    public function documents()
    {
        return $this->hasMany(DomiciliationDocument::class)->latest('id');
    }

    /**
     * Statut affiché dans la « Liste des domiciliations » (4 tableaux).
     * Déduit, jamais stocké : resilie > declare > expire > alerte > active.
     */
    /** Utilisateur ayant créé la domiciliation (colonne « Ajouter par »). */
    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Journal des actions Renouveler / Déclarer / Résilier, la plus récente d'abord. */
    public function operations()
    {
        return $this->hasMany(DomiciliationOperation::class)->latest('id');
    }

    /** Domiciliation que celle-ci prolonge (null si c'est une première période). */
    public function renouvelleDe()
    {
        return $this->belongsTo(Domiciliation::class, 'renouvelle_de_id');
    }

    public function getStatutAffichageAttribute(): string
    {
        if ($this->etat === 'resilie') {
            return 'resilie';
        }

        if ($this->etat === 'declare') {
            return 'declare';
        }

        if ($this->date_fin) {
            $today = now()->startOfDay();

            if ($this->date_fin->lt($today)) {
                return 'expire';
            }

            if ($this->date_fin->lte($today->copy()->addDays(self::JOURS_ALERTE))) {
                return 'alerte';
            }
        }

        return 'active';
    }

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }
}
