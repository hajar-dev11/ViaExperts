<?php

namespace App\Models;

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

    public function document()
    {
        return $this->belongsTo(DocumentCommercial::class, 'document_id');
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
     */
    public static function synchroniserFacture(?int $documentId): void
    {
        if (! $documentId) {
            return;
        }

        $document = DocumentCommercial::find($documentId);
        if (! $document) {
            return;
        }

        // Seuls les paiements encore actifs comptent : archivés/corbeille exclus.
        $somme = static::where('document_id', $documentId)
            ->where('status', 'actif')
            ->sum('prix_paye');

        $document->forceFill(['prix_paye' => round((float) $somme, 2)])->save();
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
