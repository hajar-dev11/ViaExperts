<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DocumentCommercial extends Model
{
    use SoftDeletes;

    protected $table = 'documents_commerciaux';

    /** Type de document → suffixe des permissions du catalogue `facturation`. */
    public const TYPES = [
        'facture' => 'facture',
        'devis' => 'devis',
        'bl' => 'bon_livraison',
        'avoir' => 'facture_avoir',
    ];

    /** Émetteur → table de paramètres qui porte sa numérotation et son branding. */
    public const EMETTEURS = ['via_experts', 'bureau_comptabilite'];

    protected $fillable = [
        'type', 'emetteur', 'responsable', 'party_id', 'numero',
        'date_document', 'date_paiement', 'date_credit', 'mode_paiement',
        'signature', 'note',
        'total_ht', 'total_remise', 'total_net_ht', 'total_tva', 'total_ttc',
        'prix_paye', 'status', 'created_by',
    ];

    protected $casts = [
        'date_document' => 'datetime',
        'date_paiement' => 'date',
        'date_credit' => 'date',
        'signature' => 'boolean',
        'total_ht' => 'decimal:2',
        'total_remise' => 'decimal:2',
        'total_net_ht' => 'decimal:2',
        'total_tva' => 'decimal:2',
        'total_ttc' => 'decimal:2',
        'prix_paye' => 'decimal:2',
    ];

    protected $appends = ['prix_restant'];

    public function lignes()
    {
        return $this->hasMany(DocumentLigne::class, 'document_id')->orderBy('ordre');
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

    /** Champ grisé de la capture : jamais stocké. */
    public function getPrixRestantAttribute(): string
    {
        return number_format((float) $this->total_ttc - (float) $this->prix_paye, 2, '.', '');
    }

    /** Nom affiché dans la colonne CLIENT/ENTREPRISE. */
    public function getTiersNomAttribute(): ?string
    {
        return $this->entreprise->denomination ?? $this->client->nom ?? null;
    }

    /**
     * Recalcule les 5 totaux à partir des lignes.
     * Remise en %, TVA en % — appliquées ligne par ligne comme sur la capture.
     */
    public function recalculerTotaux(): void
    {
        $ht = $remise = $tva = 0.0;

        foreach ($this->lignes as $ligne) {
            $brut = (float) $ligne->quantite * (float) $ligne->prix_unitaire;
            $ligneRemise = $brut * ((float) $ligne->remise_pourcent / 100);
            $net = $brut - $ligneRemise;

            $ht += $brut;
            $remise += $ligneRemise;
            $tva += $net * ((float) $ligne->tva_pourcent / 100);
        }

        $netHt = $ht - $remise;

        $this->forceFill([
            'total_ht' => round($ht, 2),
            'total_remise' => round($remise, 2),
            'total_net_ht' => round($netHt, 2),
            'total_tva' => round($tva, 2),
            'total_ttc' => round($netHt + $tva, 2),
        ])->save();
    }

    public function scopeType($query, string $type)
    {
        return $query->where('type', $type);
    }

    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }
}
