<?php

namespace App\Modules\Domiciliation\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class DomiciliationResource extends JsonResource
{
    public function toArray($request)
    {
        $entreprise = $this->whenLoaded('entreprise');

        return [
            'id' => $this->id,

            'entrepriseId' => $this->entreprise_id,
            'denomination' => $entreprise->denomination ?? null,
            // `entreprises` n'a pas de colonne email : on remonte celui du client rattaché.
            'email' => $entreprise->client->email ?? null,
            'numeroArchive' => $entreprise->numero_archive ?? null,
            'ice' => $entreprise->ice ?? null,
            'if' => $entreprise->if ?? null,

            'centreId' => $this->centre_domiciliation_id,
            'centre' => $this->whenLoaded('centre')->nom ?? null,
            // Utilisés par le contrat, l'attestation et la procuration imprimés.
            'centreAdresse' => $this->whenLoaded('centre')->adresse ?? null,
            'centreVille' => $this->whenLoaded('centre')->ville ?? null,
            'centreIce' => $this->whenLoaded('centre')->ice ?? null,

            // Coordonnées du client titulaire, reprises sur les documents.
            'client' => $entreprise->client->nom ?? null,
            'clientCin' => $entreprise->client->cin ?? null,
            'clientAdresse' => $entreprise->client->adresse ?? null,

            'moisPayee' => $this->mois_payee,
            'moisGratuits' => $this->mois_gratuits,
            'dateDepart' => optional($this->date_depart)->toDateString(),
            'dateFin' => optional($this->date_fin)->toDateString(),

            'modePaiement' => $this->mode_paiement,
            'prixParMois' => $this->prix_par_mois,
            'prixTotal' => $this->prix_total,

            'signatureSurFacture' => $this->signature_sur_facture,
            'dateFacture' => optional($this->date_facture)->toDateString(),
            'datePaiement' => optional($this->date_paiement)->toDateString(),
            'dateLegalisation' => optional($this->date_legalisation)->toDateString(),

            'docFacture' => $this->doc_facture,
            'docContrat' => $this->doc_contrat,
            'docAttestation' => $this->doc_attestation,
            'docProcuration' => $this->doc_procuration,

            'etat' => $this->etat,
            'status' => $this->status,
            'statutAffichage' => $this->statut_affichage,
            'dateResiliation' => optional($this->date_resiliation)->toDateString(),
            'dateDeclaration' => optional($this->date_declaration)->toDateString(),
            // Colonnes « Date d'ajout » et « Ajouter par » de la fiche entreprise.
            'createdAt' => optional($this->created_at)->toDateTimeString(),
            'createdBy' => $this->auteur->name ?? null,

            // Renseigné quand la période prolonge une domiciliation précédente :
            // c'est ce qui distingue « Renouveler » de « Nouveau ».
            'renouvelleDeId' => $this->renouvelle_de_id,

            // Journal Renouveler / Déclarer / Résilier.
            'operations' => $this->whenLoaded('operations', fn () => $this->operations->map(fn ($o) => [
                'id' => $o->id,
                'type' => $o->type,
                'commentaire' => $o->commentaire,
                'fichierNom' => $o->fichier_nom,
                'par' => $o->auteur->name ?? null,
                'createdAt' => optional($o->created_at)->toDateTimeString(),
            ])->values(), []),

            // Une observation privée n'est reprise que pour son auteur et les
            // administrateurs — le filtrage se fait ici, donc il s'applique
            // partout où cette ressource est utilisée (même règle que la fiche
            // Entreprise, voir `EntrepriseObservation::estVisiblePar`).
            'observations' => $this->whenLoaded('observations', fn () => $this->observations
                ->filter(fn ($o) => $o->estVisiblePar($request->user()))
                ->map(fn ($o) => [
                    'id' => $o->id,
                    'contenu' => $o->contenu,
                    'privee' => $o->privee,
                    'status' => $o->status,
                    'fichierNom' => $o->fichier_nom,
                    'aFichier' => (bool) $o->fichier_chemin,
                    'createdAt' => optional($o->created_at)->toDateTimeString(),
                    'ajoutePar' => $o->auteur->name ?? null,
                ])->values()),

            'documents' => $this->whenLoaded('documents', fn () => $this->documents->map(fn ($d) => [
                'id' => $d->id,
                'nom' => $d->nom,
                'chemin' => $d->chemin,
                'taille' => $d->taille,
                'status' => $d->status,
                'createdAt' => optional($d->created_at)->toDateTimeString(),
                'ajoutePar' => $d->auteur->name ?? null,
            ])),
        ];
    }
}
