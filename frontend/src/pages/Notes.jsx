import { useEffect, useState } from 'react'
import { Plus, Trash2, StickyNote, Search } from 'lucide-react'
import EmptyState from '../components/EmptyState.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import Button from '../components/ui/Button.jsx'
import { useNotes } from '../context/NotesContext.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { formatDateTime } from '../utils/format.js'

const EMPTY_DRAFT = { title: '', content: '' }

export default function Notes() {
  const { notes, addNote, updateNote, removeNote } = useNotes()
  const toast = useToast()
  // `null` = aucune sélection, `'new'` = brouillon pas encore enregistré,
  // sinon l'id d'une note existante.
  const [activeId, setActiveId] = useState(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const active = activeId && activeId !== 'new' ? notes.find((n) => n.id === activeId) ?? null : null

  // Sélectionne la première note dès que la liste est chargée (une seule
  // fois) ; ne perturbe jamais une sélection déjà faite par l'utilisateur.
  useEffect(() => {
    if (activeId === null && notes.length > 0) setActiveId(notes[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  // Recharge le brouillon depuis la note sélectionnée (jamais depuis la
  // saisie en cours) : un brouillon en cours d'édition n'est écrasé que
  // lorsqu'on change explicitement de note.
  useEffect(() => {
    setDraft(active ? { title: active.title, content: active.content } : EMPTY_DRAFT)
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase()
  const filtered = q ? notes.filter((n) => `${n.title} ${n.content}`.toLowerCase().includes(q)) : notes

  const createDraft = () => {
    setActiveId('new')
    setDraft(EMPTY_DRAFT)
  }

  const annuler = () => {
    if (activeId === 'new') {
      setActiveId(notes[0]?.id ?? null)
      setDraft(EMPTY_DRAFT)
    } else if (active) {
      setDraft({ title: active.title, content: active.content })
    }
  }

  const sauvegarder = async () => {
    setSaving(true)
    try {
      if (activeId === 'new') {
        const note = await addNote(draft)
        setActiveId(note.id)
      } else {
        await updateNote(activeId, draft)
      }
      toast.success('Note enregistrée.')
    } catch {
      toast.error("La note n'a pas pu être enregistrée.")
    } finally {
      setSaving(false)
    }
  }

  const supprimer = async () => {
    setConfirmDelete(false)
    await removeNote(activeId)
    setActiveId(null)
  }

  const modifie = activeId === 'new' ? (draft.title || draft.content) : (active && (draft.title !== active.title || draft.content !== active.content))

  return (
    <div className="rounded-xl bg-white shadow-card overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr] h-[600px]">
        <div className="border-r border-line flex flex-col">
          <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
            <h1 className="text-lg font-bold text-ink-900">Notes</h1>
            <button
              type="button"
              onClick={createDraft}
              title="Nouvelle Note"
              className="grid h-8 w-8 place-items-center rounded-lg bg-success-500 text-white hover:bg-success-600 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="p-3 border-b border-line">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher..."
                className="w-full rounded-lg border border-line bg-surface pl-9 pr-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <EmptyState icon={StickyNote} title="Aucune note" />
            ) : (
              filtered.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setActiveId(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-line transition-colors ${activeId === n.id ? 'bg-brand-50' : 'hover:bg-surface'}`}
                >
                  <div className={`text-sm truncate ${activeId === n.id ? 'font-bold text-brand-700' : 'font-medium text-ink-900'}`}>{n.title || 'Sans titre'}</div>
                  <div className="text-xs text-ink-600 truncate mt-0.5">{n.content || 'Note vide'}</div>
                  <div className="text-[11px] text-ink-600 mt-1">{formatDateTime(n.updatedAt)}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col min-w-0">
          {activeId === null ? (
            <div className="flex-1 grid place-items-center">
              <EmptyState icon={StickyNote} title="Aucune note sélectionnée" hint="Créez une note pour commencer." />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-line gap-3">
                <input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Titre de la note"
                  className="flex-1 font-semibold text-ink-900 text-sm focus:outline-none min-w-0"
                />
                {active && (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="text-ink-600 hover:text-danger-600 transition-colors shrink-0" title="Supprimer">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <textarea
                value={draft.content}
                onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                placeholder="Écrivez votre note ici..."
                className="flex-1 resize-none p-5 text-sm text-ink-800 focus:outline-none"
              />
              <div className="flex items-center justify-between px-5 py-2.5 border-t border-line">
                <span className="text-[11px] text-ink-600">
                  {active ? `Modifiée le ${formatDateTime(active.updatedAt)}` : 'Nouvelle note — pas encore enregistrée'}
                </span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={annuler} disabled={!modifie}>Annuler</Button>
                  <Button type="button" variant="primary" size="sm" onClick={sauvegarder} loading={saving} disabled={!modifie}>Sauvegarder</Button>
                </div>
              </div>
            </>
          )}
        </div>

        <ConfirmDialog
          open={confirmDelete}
          title="Supprimer cette note ?"
          message="Cette action est irréversible."
          confirmLabel="Supprimer"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={supprimer}
        />
    </div>
  )
}
