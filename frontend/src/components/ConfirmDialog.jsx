import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'

/**
 * ConfirmDialog — confirmation d'une action destructive.
 *
 * API inchangée (open, title, message, confirmLabel, cancelLabel, onConfirm,
 * onCancel) : les 25 usages existants fonctionnent sans modification.
 *
 * Rebâti sur `ui/Modal.jsx` : il gagne le rôle `dialog`, la fermeture par Échap,
 * le piège de focus et la restitution du focus.
 * `tone` (optionnel) permet une confirmation non destructive.
 */
export default function ConfirmDialog({
  open,
  title = 'Confirmer la suppression',
  message,
  confirmLabel = 'Supprimer',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  tone = 'danger',
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className="text-sm text-ink-800">{message}</p>}
    </Modal>
  )
}
