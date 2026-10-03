import { Printer } from 'lucide-react'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'

/**
 * Choix du format du reçu de paiement (A5 / A4) avant impression — partagé par
 * « Liste des paiements » et « Mouvement → Entrées (Reçu) » pour que les deux pages
 * se comportent à l'identique. `onChoisir('a5' | 'a4')` doit lancer l'impression
 * directement : l'onglet du PDF est ouvert par ce clic.
 */
export default function ChoixFormatRecu({ open, reference, onChoisir, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Imprimer le reçu"
      description={reference ? `Reçu de paiement ${reference} — choisissez le format.` : 'Choisissez le format du reçu.'}
      size="sm"
    >
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" icon={<Printer size={16} />} onClick={() => onChoisir('a5')}>Reçu A5</Button>
        <Button variant="secondary" icon={<Printer size={16} />} onClick={() => onChoisir('a4')}>Reçu A4</Button>
      </div>
    </Modal>
  )
}
