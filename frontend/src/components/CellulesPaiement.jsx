import { useState } from 'react'
import { Download } from 'lucide-react'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import { urlFichierPaiement } from '../api/paiements.js'

/**
 * Colonnes « Fichier » et « Observation » des tableaux de paiements (historique d'un service, liste des paiements).
 *
 * - Fichier : une icône de téléchargement UNIQUEMENT s'il existe une pièce jointe ; le fichier est servi par l'API, qui contrôle
 *   les droits (jamais un lien public) et ne renvoie que celui du paiement concerné. Sans fichier : un tiret.
 * - Observation : le texte (abrégé dans le tableau) s'ouvre en entier dans une fenêtre ; sans observation, rien ne s'ouvre.
 */
export function CelluleFichierPaiement({ paiement }) {
  if (!(paiement.aFichier ?? Boolean(paiement.pieceJointeChemin))) return <span className="text-ink-600">—</span>

  return (
    <a
      href={urlFichierPaiement(paiement.id)}
      title={paiement.pieceJointeNom ? `Télécharger « ${paiement.pieceJointeNom} »` : 'Télécharger le fichier'}
      aria-label={`Télécharger le fichier du paiement ${paiement.reference ?? paiement.id}`}
      className="inline-grid h-8 w-8 place-items-center rounded-lg text-brand-600 transition-colors hover:bg-brand-50 focus-ring"
    >
      <Download size={16} />
    </a>
  )
}

/** Observation cliquable + fenêtre du texte complet : `const { cellule, modale } = useObservationPaiement()`. */
export function useObservationPaiement() {
  const [ouverte, setOuverte] = useState(null)
  const texte = (p) => String(p.observation ?? '').trim()

  const cellule = (p) => (texte(p)
    ? (
      <button
        type="button"
        onClick={() => setOuverte(p)}
        title="Lire l'observation complète"
        className="line-clamp-1 w-full rounded text-left break-all text-brand-600 hover:underline focus-ring"
      >
        {p.observation}
      </button>
    )
    : <span className="text-ink-600">—</span>)

  const modale = ouverte && (
    <Modal
      open
      onClose={() => setOuverte(null)}
      size="lg"
      title="Observation"
      description={ouverte.reference ? `Paiement ${ouverte.reference}` : undefined}
      footer={<Button variant="secondary" onClick={() => setOuverte(null)}>Fermer</Button>}
    >
      <p className="max-h-[60vh] overflow-y-auto text-[15px] leading-relaxed break-words whitespace-pre-wrap text-ink-800">{texte(ouverte)}</p>
    </Modal>
  )

  return { cellule, modale }
}
