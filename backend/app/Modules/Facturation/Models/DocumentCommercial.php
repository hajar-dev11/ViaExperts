<?php

namespace App\Modules\Facturation\Models;

use App\Models\Client;
use App\Models\Entreprise;
use App\Models\Party;
use App\Support\ArrondiPrix;
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
     * Remise en MONTANT (Dh) — ou, pour une ligne ancienne, en % — et TVA en %, ligne par ligne (voir DocumentLigne::remiseEnDh).
     */
    public function recalculerTotaux(): void
    {
        // Prix unitaires et lignes : centimes conservés. TOTAL HT arrondi à l'entier (règle du demi) ; TVA et TTC calculés sur
        // ce total arrondi (voir ArrondiPrix::totauxDocument, identique au frontend).
        $totaux = ArrondiPrix::totauxDocument($this->lignes->map(fn ($ligne) => [
            'brut' => $ligne->brut(),
            'remise' => $ligne->remiseEnDh(),
            'tva_pourcent' => (float) $ligne->tva_pourcent,
        ]));

        $this->forceFill($totaux)->save();
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
