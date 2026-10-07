<?php

namespace App\Models;

use App\Modules\Facturation\Contracts\FactureReference;
use App\Modules\Facturation\Contracts\MontantFacture;
use App\Modules\Facturation\Contracts\SynchronisationPaiements;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class Paiement extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'reference', 'emetteur', 'responsable', 'party_id', 'document_id',
        'date_operation', 'date_credit', 'mode_paiement', 'signature',
        'piece_jointe_nom', 'piece_jointe_chemin', 'observation',
        'total', 'prix_paye', 'status', 'created_by',
    ];

    protected $casts = [
        'date_operation' => 'datetime',
        'date_credit' => 'date',
        'signature' => 'boolean',
        'total' => 'decimal:2',
        'prix_paye' => 'decimal:2',
    ];

    protected $appends = ['prix_restant'];

    public function lignes()
    {
        return $this->hasMany(PaiementLigne::class)->orderBy('ordre');
    }

    public function party()
    {
        return $this->belongsTo(Party::class);
    }

    public function client()
    {
        return $this->belongsTo(Client::class, 'party_id', 'party_id');
    }

    public function entreprise()
    {
        return $this->belongsTo(Entreprise::class, 'party_id', 'party_id');
    }

    /**
     * Numéros de factures déjà résolus pour un lot de paiements (non persisté) : document_id => numéro|null.
     *
     * @var array<int, string|null>
     */
    protected array $numerosFactures = [];

    /**
     * Numéro de la facture rattachée, lu via le contrat PUBLIC de Facturation (plus de relation Eloquent vers le modèle
     * DocumentCommercial). Null sans facture, ou si celle-ci est en corbeille / introuvable — comme l'ancienne relation.
     */
    public function numeroFacture(): ?string
    {
        if (! $this->document_id) {
            return null;
        }

        if (! array_key_exists($this->document_id, $this->numerosFactures)) {
            $this->numerosFactures[$this->document_id] = app(FactureReference::class)->numeros([$this->document_id])[$this->document_id] ?? null;
        }

        return $this->numerosFactures[$this->document_id];
    }

    /** Résout en UNE requête les numéros de factures d'une liste de paiements (remplace l'ancien eager-loading). */
    public static function chargerNumerosFactures(iterable $paiements): void
    {
        $paiements = collect($paiements);
        $numeros = app(FactureReference::class)->numeros($paiements->pluck('document_id')->all());

        foreach ($paiements as $paiement) {
            if ($paiement->document_id) {
                $paiement->numerosFactures[$paiement->document_id] = $numeros[$paiement->document_id] ?? null;
            }
        }
    }

    /** Colonne PRIX RESTANT de la capture : calculée, jamais stockée. */
    public function getPrixRestantAttribute(): string
    {
        return number_format((float) $this->total - (float) $this->prix_paye, 2, '.', '');
    }

    public function getTiersNomAttribute(): ?string
    {
        return $this->entreprise->denomination ?? $this->client->nom ?? null;
    }

    public function recalculerTotal(): void
    {
        $total = $this->lignes->sum(fn ($l) => (float) $l->quantite * (float) $l->prix_unitaire);

        $this->forceFill(['total' => round($total, 2)])->save();
    }

    /**
     * Option C (hybride) : `documents_commerciaux.prix_paye` est une colonne stockée,
     * resynchronisée sur la somme des paiements actifs rattachés à la facture.
     *
     * Appelée dans la transaction qui crée / modifie / archive / supprime un paiement,
     * ce qui évite toute divergence entre la facture et ses paiements.
     *
     * `$partManuelle` : montant « payé » saisi à la main sur la facture, sans paiement enregistré correspondant (voir
     * {@see partManuelle()}, à lire AVANT la modification du paiement). Il est conservé : sans cela, le premier paiement
     * écraserait ce montant, et le reste à payer se rouvrirait à tort.
     */
    public static function synchroniserFacture(?int $documentId, float $partManuelle = 0.0): void
    {
        if (! $documentId) {
            return;
        }

        // Seuls les paiements encore actifs comptent : archivés/corbeille exclus.
        $somme = static::where('document_id', $documentId)
            ->where('status', 'actif')
            ->sum('prix_paye');

        // L'écriture de `prix_paye` appartient à Facturation : elle passe par son contrat (même transaction).
        app(SynchronisationPaiements::class)->appliquerTotalPaye($documentId, (float) $somme + max(0.0, $partManuelle));
    }

    /**
     * Part du montant « payé » de la facture qui n'est couverte par AUCUN paiement actif : un montant saisi à la main sur
     * la facture (colonne `prix_paye` des documents, champ « payé » du formulaire). Vaut 0 quand la facture est
     * synchronisée sur ses paiements (cas normal). À appeler sous le verrou de création/modification des paiements.
     */
    public static function partManuelle(?int $documentId): float
    {
        if (! $documentId) {
            return 0.0;
        }

        $paye = app(MontantFacture::class)->prixPaye($documentId);

        if ($paye === null) {
            return 0.0;
        }

        $somme = (float) static::where('document_id', $documentId)->where('status', 'actif')->sum('prix_paye');

        return max(0.0, round($paye - $somme, 2));
    }

    /** Référence séquentielle (#904 dans la capture). */
    public static function prochaineReference(): string
    {
        $dernier = DB::table('paiements')->max('id') ?? 0;

        return '#'.($dernier + 1);
    }

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }
}
