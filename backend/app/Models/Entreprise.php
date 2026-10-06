<?php

namespace App\Models;

use App\Modules\Domiciliation\Contracts\CentresDomiciliationReference;
use Illuminate\Database\Eloquent\Model;

class Entreprise extends Model
{
    protected $primaryKey = 'party_id';
    public $incrementing = false;
    public $timestamps = false; // les horodatages vivent sur `parties`

    protected $fillable = [
        'party_id',
        'type',
        'denomination',
        'tribunal',
        'forme_juridique',
        'ice',
        'rc',
        'if',
        'tp',
        'cnss',
        'date_debut_activite',
        'capital',
        'situation',
        'single',
        'periode_declaration_tva',
        'local',
        'centre_domiciliation_id',
        'client_id',
        'numero_dossier',
        'numero_archive',
        'observation',
    ];

    protected $casts = [
        'date_debut_activite' => 'date',
        'capital' => 'decimal:2',
    ];

    public function party()
    {
        return $this->belongsTo(Party::class, 'party_id', 'id');
    }

    /**
     * Noms de centres déjà résolus pour un lot d'entreprises (non persisté) : centre_domiciliation_id => nom|null.
     *
     * @var array<int, string|null>
     */
    protected array $nomsCentres = [];

    /**
     * Nom du centre de domiciliation, lu via le contrat PUBLIC de Domiciliation (plus de relation Eloquent vers le modèle
     * CentreDomiciliation). Null sans centre, ou si celui-ci est introuvable / supprimé en douceur — comme l'ancienne relation.
     */
    public function nomCentreDomiciliation(): ?string
    {
        if (! $this->centre_domiciliation_id) {
            return null;
        }

        if (! array_key_exists($this->centre_domiciliation_id, $this->nomsCentres)) {
            $this->nomsCentres[$this->centre_domiciliation_id] = app(CentresDomiciliationReference::class)
                ->nomsParIds([$this->centre_domiciliation_id])[$this->centre_domiciliation_id] ?? null;
        }

        return $this->nomsCentres[$this->centre_domiciliation_id];
    }

    /** Résout en UNE requête les noms de centres d'une liste d'entreprises (remplace l'ancien eager-loading). */
    public static function chargerCentresDomiciliation(iterable $entreprises): void
    {
        $entreprises = collect($entreprises);
        $noms = app(CentresDomiciliationReference::class)->nomsParIds($entreprises->pluck('centre_domiciliation_id')->all());

        foreach ($entreprises as $entreprise) {
            if ($entreprise->centre_domiciliation_id) {
                $entreprise->nomsCentres[$entreprise->centre_domiciliation_id] = $noms[$entreprise->centre_domiciliation_id] ?? null;
            }
        }
    }
    public function client()
    {
        return $this->belongsTo(Client::class, 'client_id', 'party_id');
    }

    public function secteurs()
    {
        return $this->hasMany(EntrepriseSecteur::class, 'entreprise_id', 'party_id')->orderBy('ordre');
    }

    /** Gérants, associés et partenaires rattachés à l'entreprise. */
    public function associes()
    {
        return $this->hasMany(EntrepriseAssocie::class, 'entreprise_id', 'party_id')->orderBy('ordre');
    }

    /** Documents joints, les plus récents d'abord. */
    public function documents()
    {
        return $this->hasMany(EntrepriseDocument::class, 'entreprise_id', 'party_id')
            ->orderByDesc('created_at');
    }

    /** Historique des observations, les plus récentes d'abord. */
    public function observationsListe()
    {
        return $this->hasMany(EntrepriseObservation::class, 'entreprise_id', 'party_id')
            ->orderByDesc('created_at');
    }

    public function scopeWithStatus($query, string $status)
    {
        return $query->whereHas('party', fn ($q) => $q->where('status', $status));
    }
}
