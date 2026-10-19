<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Une ACTIVITÉ sur un service en cours (ligne du fil « Activité Services »).
 *
 * Différence avec {@see ServiceEnCours} : le service en cours est l'élément SUIVI (un par couple client/service) ; l'activité
 * est une OPÉRATION effectuée dessus — création automatique, changement de statut, commentaire, fichier ajouté.
 */
class ServiceEnCoursOperation extends Model
{
    public const ACTION_CREATION = 'creation';
    public const ACTION_STATUT = 'statut';
    public const ACTION_COMMENTAIRE = 'commentaire';
    public const ACTION_FICHIER = 'fichier';

    protected $fillable = [
        'service_en_cours_id', 'action', 'service_status_id', 'ancien_status_id', 'commentaire',
        'fichier_nom', 'fichier_chemin',
        'source_type', 'source_id', 'source_fichier_nom', 'source_fichier_chemin',
        'created_by',
    ];

    /**
     * Colonnes de la TRACE d'activité, ajoutées par la migration `2026_10_12_180000_add_trace_to_service_en_cours_operations_table`.
     * Une base sur laquelle cette migration n'a pas encore été appliquée (poste local en retard, serveur avant mise à jour)
     * ne les possède pas : y écrire provoquait « SQLSTATE[42S22] Unknown column 'action' » et faisait ÉCHOUER l'enregistrement
     * d'une facture, d'un paiement ou d'une déclaration, alors que l'activité n'en est qu'un effet secondaire.
     */
    public const COLONNES_TRACE = ['action', 'ancien_status_id', 'source_type', 'source_id', 'source_fichier_nom', 'source_fichier_chemin'];

    private static ?bool $traceDisponible = null;

    /** La base possède-t-elle les colonnes de la trace ? (une seule vérification par exécution) */
    public static function tracabiliteDisponible(): bool
    {
        return self::$traceDisponible ??= Schema::hasColumn((new static)->getTable(), 'action');
    }

    /** Test seam : force (true / false) ou réinitialise (null) la détection du schéma. */
    public static function forcerTracabilite(?bool $disponible): void
    {
        self::$traceDisponible = $disponible;
    }

    /**
     * Attributs réellement ÉCRIVABLES : avec la trace si la base la possède, sinon sans les colonnes absentes (le reste de
     * l'opération — statut, commentaire, fichier, auteur — est enregistré comme avant la migration).
     */
    public static function attributsCompatibles(array $attributs, bool $traceDisponible): array
    {
        return $traceDisponible ? $attributs : Arr::except($attributs, self::COLONNES_TRACE);
    }

    /**
     * Enregistre une activité en respectant le schéma réel de la base.
     *
     * Base À JOUR : la trace complète est écrite (action, ancien statut, document d'origine et sa pièce jointe).
     * Base SANS la migration : l'opération s'enregistre sans ces colonnes, l'anomalie est journalisée (storage/logs) et la
     * ligne de CRÉATION automatique — qui n'a de sens qu'avec la trace — n'est pas écrite (comportement d'avant la migration).
     * Ce filet de sécurité n'est PAS un remplacement de la migration : tant qu'elle n'est pas appliquée, la trace est perdue.
     */
    public static function enregistrer(array $attributs): ?self
    {
        $disponible = self::tracabiliteDisponible();

        if (! $disponible) {
            Log::warning("Migration « add_trace_to_service_en_cours_operations_table » non appliquée sur cette base : l'activité est enregistrée sans trace détaillée (action, document d'origine).");

            if (($attributs['action'] ?? null) === self::ACTION_CREATION) {
                return null;
            }
        }

        return static::create(self::attributsCompatibles($attributs, $disponible));
    }

    public function serviceEnCours()
    {
        return $this->belongsTo(ServiceEnCours::class, 'service_en_cours_id');
    }

    public function statut()
    {
        return $this->belongsTo(ServiceStatus::class, 'service_status_id');
    }

    public function ancienStatut()
    {
        return $this->belongsTo(ServiceStatus::class, 'ancien_status_id');
    }

    public function auteur()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
