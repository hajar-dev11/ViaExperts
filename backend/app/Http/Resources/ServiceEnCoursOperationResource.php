<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/**
 * Une activité de « Services en cours » : même forme pour la fiche d'un service (fil complet) et pour le fil global
 * « Activité Services » du tableau de bord. Rien n'est inventé : l'auteur est l'utilisateur enregistré (`par`), la date et
 * l'heure sont celles de l'opération, les fichiers viennent de la base.
 *
 * Deux sortes de fichiers, jamais confondues :
 *   - `fichierNom` / `fichierChemin`  : ajouté à la main au service (supprimé avec lui) ;
 *   - `fichierSource`                 : pièce jointe du DOCUMENT D'ORIGINE (paiement…), seulement référencée ici ; elle n'est
 *                                       pas supprimée avec le service, et n'est affichée que si le fichier existe encore.
 */
class ServiceEnCoursOperationResource extends JsonResource
{
    private static function statut($s): ?array
    {
        return $s ? [
            'id' => $s->id,
            'nom' => $s->nom,
            'couleurTexte' => $s->couleur_texte,
            'couleurFond' => $s->couleur_fond,
        ] : null;
    }

    public function toArray($request)
    {
        $sourceFichier = $this->source_fichier_chemin && Storage::disk('public')->exists($this->source_fichier_chemin)
            ? [
                'nom' => $this->source_fichier_nom,
                'chemin' => $this->source_fichier_chemin,
            ]
            : null;

        return [
            'id' => $this->id,
            'serviceEnCoursId' => $this->service_en_cours_id,
            'action' => $this->action,

            'statut' => self::statut($this->statut),
            // Renseigné seulement quand l'opération a CHANGÉ le statut.
            'ancienStatut' => self::statut($this->ancienStatut),

            'commentaire' => $this->commentaire,
            'par' => $this->auteur->name ?? null,
            'createdAt' => optional($this->created_at)->toDateTimeString(),

            'fichierNom' => $this->fichier_nom,
            'fichierChemin' => $this->fichier_chemin,

            'source' => $this->source_type ? ['type' => $this->source_type, 'id' => $this->source_id] : null,
            'fichierSource' => $sourceFichier,

            // Utiles au fil global, où l'on ne voit pas la ligne du tableau.
            'service' => $this->whenLoaded('serviceEnCours', fn () => $this->serviceEnCours->service->nom ?? null),
            'client' => $this->whenLoaded('serviceEnCours', fn () => $this->serviceEnCours->client->nom ?? null),
        ];
    }
}
