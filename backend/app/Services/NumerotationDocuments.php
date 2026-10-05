<?php

namespace App\Services;

use App\Models\CabinetSetting;
use App\Models\DomiciliationSetting;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Numérotation des documents commerciaux (Facture / Devis / Bon de livraison / Facture d'avoir).
 *
 * Le numéro d'un document est « préfixe + prochain numéro + suffixe », propre à chaque ÉMETTEUR (colonnes
 * `{type}_prefixe`, `{type}_prochain_numero`, `{type}_suffixe` de `cabinet_settings` pour le Bureau de comptabilité,
 * de `domiciliation_settings` pour Via Experts) et à chaque TYPE de document.
 *
 * Extrait tel quel de `DocumentCommercialController` (migration Modular Monolith — Facturation, étape 2) :
 * mêmes numéros, mêmes préfixes/suffixes, mêmes compteurs.
 */
class NumerotationDocuments
{
    /** Message déjà utilisé par `StoreDocumentCommercialRequest` quand le numéro existe avant l'écriture. */
    public const MESSAGE_NUMERO_PRIS = 'Ce numéro est déjà utilisé par un document du même type.';

    /** Nom de l'index unique (type, numero) de `documents_commerciaux`. */
    private const INDEX_UNIQUE = 'documents_commerciaux_type_numero_unique';

    /** Paramètres de l'émetteur : la ligne unique qui porte sa numérotation et son branding. */
    public function reglages(string $emetteur): Model
    {
        return $emetteur === 'via_experts'
            ? DomiciliationSetting::firstOrCreate([])
            : CabinetSetting::firstOrCreate([]);
    }

    /** Racine des colonnes de numérotation : facture_ | devis_ | bl_ | avoir_ (identique au type de document). */
    private function racine(string $type): string
    {
        return $type;
    }

    /** Numéro tel que le compose le compteur courant : préfixe + prochain numéro + suffixe. */
    public function composer(Model $reglages, string $type): string
    {
        $cle = $this->racine($type);

        return trim(sprintf(
            '%s%s%s',
            $reglages->{$cle.'_prefixe'} ?? '',
            $reglages->{$cle.'_prochain_numero'} ?? '',
            $reglages->{$cle.'_suffixe'} ?? ''
        ));
    }

    /**
     * Numéro proposé à l'utilisateur et responsable affiché, pour un émetteur et un type donnés.
     *
     * @return array{numero: string, responsable: ?string}
     */
    public function proposer(string $emetteur, string $type): array
    {
        $reglages = $this->reglages($emetteur);

        return [
            'numero' => $this->composer($reglages, $type),
            'responsable' => $reglages->nom_societe ?: ($emetteur === 'via_experts' ? 'Via Experts' : null),
        ];
    }

    /**
     * Fait avancer le compteur après émission d'un document.
     *
     * À appeler DANS la transaction de création : le `lockForUpdate()` pose un verrou sur la ligne de paramètres jusqu'à
     * la validation de cette transaction, donc deux créations simultanées ne peuvent pas lire le même compteur et
     * produire deux fois le même numéro. La méthode ouvre elle-même une transaction (point de sauvegarde si l'appelant
     * en a déjà une) afin que le verrou ne soit jamais inopérant, même si elle est appelée seule.
     *
     * Le compteur n'avance QUE si le numéro enregistré est bien celui qu'il proposait : un numéro saisi manuellement par
     * l'utilisateur ne le déplace pas. Le format (préfixe/suffixe) n'est jamais modifié.
     */
    public function avancer(string $emetteur, string $type, string $numeroUtilise): void
    {
        DB::transaction(function () use ($emetteur, $type, $numeroUtilise) {
            $classe = $emetteur === 'via_experts' ? DomiciliationSetting::class : CabinetSetting::class;

            $classe::firstOrCreate([]); // garantit l'existence de la ligne singleton
            $reglages = $classe::lockForUpdate()->first();

            if (! $reglages || $this->composer($reglages, $type) !== $numeroUtilise) {
                return;
            }

            $colonne = $this->racine($type).'_prochain_numero';
            $courant = $reglages->{$colonne};

            // La colonne est un entier non signé : un compteur vide n'est pas incrémenté.
            if ($courant === null || $courant === '') {
                return;
            }

            $reglages->{$colonne} = (int) $courant + 1;
            $reglages->save();
        });
    }

    /** Vrai si l'erreur SQL est une collision sur l'index unique (type, numero) des documents. */
    public function estCollisionNumero(QueryException $erreur): bool
    {
        $code = $erreur->errorInfo[1] ?? null;

        return ($code === 1062 || $code === '1062') && str_contains($erreur->getMessage(), self::INDEX_UNIQUE);
    }

    /**
     * Deux créations simultanées avec le même numéro : la base refuse la seconde (aucun doublon n'est jamais écrit).
     * Cette erreur est alors présentée comme une erreur de validation 422 sur le champ `numero` — exactement la réponse
     * qu'aurait donnée la vérification d'unicité si elle avait vu le premier document — au lieu d'un HTTP 500.
     * Toute autre erreur SQL est relancée telle quelle par l'appelant.
     *
     * @throws ValidationException si l'erreur est une collision de numéro
     */
    public function convertirCollision(QueryException $erreur): void
    {
        if ($this->estCollisionNumero($erreur)) {
            throw ValidationException::withMessages(['numero' => [self::MESSAGE_NUMERO_PRIS]]);
        }
    }
}
