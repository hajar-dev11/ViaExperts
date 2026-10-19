// Importateur TVA : documents lus (factures, ou déclaration de TVA) → données de « Nouvelle déclaration TVA », en une seule étape.
// Fonction pure : elle reçoit le texte lu de chaque document et renvoie l'objet `ocr` que le formulaire de déclaration préremplit.
//
//   - Facture, bon de livraison : une ligne de déclaration par document (voir analyseFacture.js).
//   - Déclaration de TVA (relevé de lignes) : toutes les lignes lues sont reprises (voir analyseDeclaration.js).
//   - Relevé bancaire ou document sans donnée lisible : écarté, avec une courte phrase ; rien n'est inventé.
// Tout reste modifiable dans le formulaire ; les valeurs douteuses y sont surlignées avec leur motif.

import { analyserDeclaration, detecterTypeDocument, signalementsFormulaire, versLignesFormulaire } from './analyseDeclaration.js'
import { analyserFacturePasses, versDeclaration } from './analyseFacture.js'

/** Nombre maximal de documents importés d'un coup. */
export const MAX_DOCUMENTS = 20

/**
 * @param {Array<{ nom: string, lecture?: { lignes: Array<{texte: string, confiance?: number}>, moteur?: string }, erreur?: string }>} documents
 * @returns {{ fichier: string, lignes: object[], signalements: object, clients: object, avertissements: string[], entete: object,
 *             controles: object[], moteur: string|null, nombreDocuments: number, nombreLus: number }}
 */
export function construireOcr(documents) {
  const lignes = []
  const signalements = {}
  const clients = {}
  const avertissements = []
  let entete = {}
  let nombreLus = 0
  let moteur = null

  documents.forEach(({ nom, lecture, erreur }) => {
    if (!lecture) {
      avertissements.push(`« ${nom} » : ${erreur ?? 'document illisible.'}`)
      return
    }
    moteur ??= lecture.moteur ?? null
    const textes = lecture.lignes.map((l) => (typeof l === 'string' ? l : l.texte))
    const type = detecterTypeDocument(textes).code

    if (type === 'releve_bancaire') {
      avertissements.push(`« ${nom} » : relevé bancaire, non pris en charge (aucune donnée reprise).`)
      return
    }

    if (type === 'declaration_tva') {
      const analyse = analyserDeclaration(lecture.lignes, { moteur: lecture.moteur })
      const retenues = analyse.lignes.map((l) => ({ ...l, inclure: true }))
      if (retenues.length === 0) {
        avertissements.push(`« ${nom} » : aucune ligne de déclaration lisible.`)
        return
      }
      const debut = lignes.length
      lignes.push(...versLignesFormulaire(retenues))
      for (const [cle, motif] of Object.entries(signalementsFormulaire(retenues))) {
        const [i, ...champ] = cle.split('.')
        signalements[`${debut + Number(i)}.${champ.join('.')}`] = motif
      }
      // L'en-tête (période, IF) n'est repris que d'une déclaration : il décrit le document, pas une facture.
      if (analyse.entete.periode_type) {
        entete = {
          periode_type: analyse.entete.periode_type, periode_valeur: analyse.entete.periode_valeur,
          annee: analyse.entete.annee, client_if: analyse.entete.client_if,
        }
      }
      nombreLus += 1
      return
    }

    // Facture, bon de livraison, ou document dont la nature n'est pas annoncée : lu comme une facture (les valeurs non lues restent vides).
    // Une photo peut avoir été lue de plusieurs façons (lecture.alternatives) : l'analyse retient la meilleure lecture des montants.
    const analyse = analyserFacturePasses([lecture.lignes, ...(lecture.alternatives ?? [])], { moteur: lecture.moteur })
    const d = versDeclaration([{ fichier: nom, analyse }])
    if (d.lignes.length === 0) {
      avertissements.push(...d.avertissements)
      return
    }
    const i = lignes.length
    lignes.push(...d.lignes.map((l) => ({ ...l, ordre_ref: String(i + 1) })))
    for (const [cle, motif] of Object.entries(d.signalements)) signalements[`${i}.${cle.slice(cle.indexOf('.') + 1)}`] = motif
    if (d.clients[0]) clients[i] = d.clients[0]
    nombreLus += 1
  })

  const noms = documents.map((d) => d.nom)
  return {
    fichier: noms.length === 1 ? noms[0] : `${noms.length} documents`,
    lignes,
    signalements,
    clients,
    avertissements,
    entete,
    controles: [],
    moteur,
    nombreDocuments: documents.length,
    nombreLus,
  }
}
