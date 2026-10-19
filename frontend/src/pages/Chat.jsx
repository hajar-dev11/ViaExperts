import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Send, RotateCw, UserRound, MessageSquare, Paperclip, Smile, Trash2, X, FileText, Check, Lock,
} from 'lucide-react'
import { IconeModifier } from '../components/ui/icons.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ImageAvecSecours from '../components/ImageAvecSecours.jsx'
import Alert from '../components/ui/Alert.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { API_URL, ApiError } from '../api/http.js'
import { listContacts, listMessages, sendMessage, updateMessage, deleteMessage } from '../api/chat.js'

const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '😘', '😎',
  '🤔', '😴', '😅', '😇', '🥳', '😢', '😭', '😡', '😱', '🤗',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '👌', '✌️', '👋', '🙌',
  '❤️', '🔥', '🎉', '✅', '❌', '⭐', '💡', '📌', '⏰', '🎯',
]

function Avatar({ photoPath, size = 16 }) {
  return (
    <div className="h-9 w-9 rounded-full bg-surface grid place-items-center text-ink-600 overflow-hidden">
      <ImageAvecSecours
        src={photoPath ? `${API_URL}/storage/${photoPath}` : null}
        className="h-full w-full object-cover"
        fallback={<UserRound size={size} />}
      />
    </div>
  )
}

/** Pièce jointe d'un message : un lien vers le fichier réel, stocké côté serveur. */
function PieceJointe({ nom, chemin, mine }) {
  return (
    <a
      href={`${API_URL}/storage/${chemin}`}
      target="_blank"
      rel="noreferrer"
      className={`mt-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium underline-offset-2 hover:underline ${
        mine ? 'bg-white/15 text-white' : 'bg-surface text-brand-700'
      }`}
    >
      <FileText size={13} className="shrink-0" /> <span className="truncate">{nom}</span>
    </a>
  )
}

// Chat interne : les contacts sont les autres utilisateurs de l'application
// (table `users`), les messages sont persistés dans `chat_messages`.
// Accès réservé aux membres qui ont la permission `chat.list` (catalogue de
// permissions, Paramètres → Assistance) : voir la gestion de `forbidden`.
export default function Chat() {
  const [contacts, setContacts] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [fichier, setFichier] = useState(null)
  const [search, setSearch] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [erreurContacts, setErreurContacts] = useState('')
  const [erreurConversation, setErreurConversation] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [emojiOuvert, setEmojiOuvert] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingBody, setEditingBody] = useState('')
  const [aSupprimer, setASupprimer] = useState(null)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  const loadContacts = useCallback(() => {
    listContacts()
      .then((rows) => {
        setErreurContacts('')
        setContacts(rows)
        setActive((cur) => cur ?? rows[0] ?? null)
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true)
        else setErreurContacts('Impossible de charger les contacts.')
      })
      .finally(() => setLoadingContacts(false))
  }, [])

  useEffect(loadContacts, [loadContacts])

  const loadThread = useCallback((userId) => {
    if (!userId) return
    setLoadingThread(true)
    listMessages(userId)
      .then((m) => { setErreurConversation(''); setMessages(m) })
      .catch(() => setErreurConversation('Impossible de charger la conversation.'))
      .finally(() => setLoadingThread(false))
  }, [])

  useEffect(() => {
    if (active?.id) loadThread(active.id)
    else setMessages([])
  }, [active?.id, loadThread])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const send = async () => {
    const body = draft.trim()
    if ((!body && !fichier) || !active || sending) return
    setSending(true)
    setError('')
    try {
      const message = await sendMessage(active.id, body, fichier)
      setMessages((m) => [...m, message])
      setDraft('')
      setFichier(null)
      setEmojiOuvert(false)
      loadContacts()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Le message n'a pas pu être envoyé.")
    } finally {
      setSending(false)
    }
  }

  const ajouterEmoji = (e) => {
    setDraft((d) => d + e)
    setEmojiOuvert(false)
  }

  const commencerEdition = (m) => {
    setEditingId(m.id)
    setEditingBody(m.body ?? '')
  }

  const annulerEdition = () => {
    setEditingId(null)
    setEditingBody('')
  }

  const enregistrerEdition = async (id) => {
    const body = editingBody.trim()
    if (!body) return
    try {
      const maj = await updateMessage(id, body)
      setMessages((ms) => ms.map((m) => (m.id === id ? maj : m)))
      annulerEdition()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "La modification n'a pas pu être enregistrée.")
    }
  }

  const confirmerSuppression = async () => {
    const cible = aSupprimer
    setASupprimer(null)
    try {
      await deleteMessage(cible.id)
      setMessages((ms) => ms.filter((m) => m.id !== cible.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Le message n'a pas pu être supprimé.")
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(q))
  }, [contacts, search])

  if (!loadingContacts && forbidden) {
    return (
      <div className="rounded-xl bg-white shadow-card">
        <div className="px-5 pt-5 pb-1"><h1 className="text-lg font-bold text-ink-900">Chat</h1></div>
        <div className="p-10">
          <EmptyState
            icon={Lock}
            title="Accès restreint"
            hint="Vous n'avez pas accès au Chat. Contactez un administrateur si vous pensez que c'est une erreur."
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      {error && <Alert tone="danger" onAutoClose={() => setError('')} className="mb-3">{error}</Alert>}
      {erreurContacts && <Alert tone="danger" className="mb-3" onRetry={() => { setErreurContacts(''); loadContacts() }}>{erreurContacts}</Alert>}
      {erreurConversation && <Alert tone="danger" className="mb-3" onRetry={() => { setErreurConversation(''); loadThread(active?.id) }}>{erreurConversation}</Alert>}

      <div className="rounded-xl bg-white shadow-card overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr] h-[600px]">
        <div className="border-r border-line flex flex-col min-h-0">
          <div className="px-3 pt-3 pb-2">
            <h1 className="text-lg font-bold text-ink-900">Chat</h1>
          </div>
          <div className="p-3 border-b border-line">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full rounded-lg border border-line bg-surface pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingContacts ? (
              <div className="py-8 text-center text-sm text-ink-600">Chargement…</div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={MessageSquare} title={contacts.length === 0 ? 'Aucun autre utilisateur' : 'Aucun résultat'} hint={contacts.length === 0 ? 'Créez un utilisateur dans Paramètres → Assistance.' : undefined} />
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActive(c)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line transition-colors ${active?.id === c.id ? 'bg-brand-50' : 'hover:bg-surface'}`}
                >
                  <div className="relative shrink-0">
                    <Avatar photoPath={c.photoPath} />
                    {c.nonLus > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger-500 text-white text-[10px] font-bold grid place-items-center ring-2 ring-white">
                        {c.nonLus}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm truncate ${active?.id === c.id ? 'font-bold text-brand-700' : 'font-medium text-ink-900'}`}>{c.name}</div>
                    <div className="text-xs text-ink-600 truncate">{c.dernierMessage || c.fonction || c.email}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col min-w-0 min-h-0">
          {!active ? (
            <div className="flex-1 grid place-items-center">
              <EmptyState icon={MessageSquare} title="Aucune conversation sélectionnée" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
                <div className="flex items-center gap-2.5">
                  <Avatar photoPath={active.photoPath} size={15} />
                  <div>
                    <span className="block font-semibold text-ink-900 text-sm">{active.name}</span>
                    <span className="block text-[11px] text-ink-600">{active.fonction || active.email}</span>
                  </div>
                </div>
                <button type="button" onClick={() => loadThread(active.id)} title="Actualiser" className="text-ink-600 hover:text-ink-900">
                  <RotateCw size={15} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-surface/40">
                {loadingThread ? (
                  <div className="text-center text-sm text-ink-600 mt-10">Chargement…</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-ink-600 mt-10">Aucun message pour le moment</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`group flex items-start gap-1.5 ${m.mine ? 'justify-end' : 'justify-start'}`}>
                      {/* Icônes Modifier / Supprimer : uniquement sur ses propres messages,
                          visibles au survol pour ne pas alourdir chaque bulle. */}
                      {m.mine && editingId !== m.id && (
                        <div className="flex items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100 order-first">
                          <button type="button" title="Modifier" onClick={() => commencerEdition(m)} className="grid h-7 w-7 place-items-center rounded-lg text-ink-600 hover:bg-white hover:text-brand-600">
                            <IconeModifier size={13} />
                          </button>
                          <button type="button" title="Supprimer" onClick={() => setASupprimer(m)} className="grid h-7 w-7 place-items-center rounded-lg text-ink-600 hover:bg-white hover:text-danger-600">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}

                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${m.mine ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-white border border-line text-ink-800 rounded-bl-sm'}`}>
                        {editingId === m.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={editingBody}
                              onChange={(e) => setEditingBody(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); enregistrerEdition(m.id) }
                                if (e.key === 'Escape') annulerEdition()
                              }}
                              className="min-w-[10rem] flex-1 rounded-md bg-white/20 px-2 py-1 text-sm text-white placeholder:text-white/70 focus:outline-none"
                            />
                            <button type="button" title="Enregistrer" onClick={() => enregistrerEdition(m.id)} className="shrink-0 rounded-md p-1 hover:bg-white/20"><Check size={14} /></button>
                            <button type="button" title="Annuler" onClick={annulerEdition} className="shrink-0 rounded-md p-1 hover:bg-white/20"><X size={14} /></button>
                          </div>
                        ) : (
                          <>
                            {m.body && <span className="whitespace-pre-wrap break-words">{m.body}</span>}
                            {m.fichierChemin && <PieceJointe nom={m.fichierNom} chemin={m.fichierChemin} mine={m.mine} />}
                          </>
                        )}
                        <span className={`block mt-1 text-[10px] ${m.mine ? 'text-white/70' : 'text-ink-600'}`}>{m.createdAt}</span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-line p-3">
                {fichier && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs text-ink-700">
                    <Paperclip size={13} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{fichier.name}</span>
                    <button type="button" onClick={() => setFichier(null)} title="Retirer" className="shrink-0 text-ink-600 hover:text-danger-600"><X size={14} /></button>
                  </div>
                )}
                <div className="relative flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) setFichier(e.target.files[0]); e.target.value = '' }}
                  />
                  <button
                    type="button"
                    title="Joindre un fichier"
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-surface hover:text-ink-900"
                  >
                    <Paperclip size={17} />
                  </button>
                  <button
                    type="button"
                    title="Emoji"
                    onClick={() => setEmojiOuvert((o) => !o)}
                    className="shrink-0 grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink-900"
                  >
                    <Smile size={17} />
                  </button>

                  {emojiOuvert && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setEmojiOuvert(false)} />
                      <div className="absolute bottom-full left-0 z-20 mb-2 grid w-64 grid-cols-8 gap-1 rounded-lg border border-slate-200 bg-white p-2.5 shadow-menu">
                        {EMOJIS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => ajouterEmoji(e)}
                            className="grid h-7 w-7 place-items-center rounded-md text-lg hover:bg-slate-100"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="Tapez votre message ici..."
                    className="flex-1 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                  <button
                    onClick={send}
                    disabled={sending || (!draft.trim() && !fichier)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-semibold"
                  >
                    {sending ? 'Envoi…' : 'Envoyer'} <Send size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!aSupprimer}
        title="Supprimer ce message ?"
        message="Cette action est irréversible."
        confirmLabel="Supprimer"
        onCancel={() => setASupprimer(null)}
        onConfirm={confirmerSuppression}
      />
    </div>
  )
}
