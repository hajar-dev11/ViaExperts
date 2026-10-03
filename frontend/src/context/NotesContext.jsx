import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { listNotes, createNote, updateNote as updateNoteApi, deleteNote } from '../api/notes.js'
import { useAuth } from './AuthContext.jsx'

const NotesContext = createContext(null)

// Convertit la forme de l'API (titre/contenu) vers la forme historique
// consommée par `Notes.jsx` et la Topbar (title/content).
function versForme(n) {
  return {
    id: n.id,
    title: n.titre ?? '',
    content: n.contenu ?? '',
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }
}

export function NotesProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [notes, setNotes] = useState([])

  useEffect(() => {
    // Même raison que FilesProvider : pas d'appel protégé tant que personne
    // n'est authentifié (pages publiques login/mot de passe oublié/reset).
    if (!isAuthenticated) {
      setNotes([])
      return
    }
    listNotes().then((data) => setNotes(data.map(versForme))).catch(() => {})
  }, [isAuthenticated])

  // Réellement enregistrée côté serveur : reste disponible après un refresh
  // ou une fermeture/réouverture de l'application (plus seulement le
  // `localStorage` du navigateur).
  const addNote = useCallback(async (data) => {
    const created = await createNote({ titre: data?.title ?? '', contenu: data?.content ?? '' })
    const note = versForme(created)
    setNotes((n) => [note, ...n])
    return note
  }, [])

  const updateNote = useCallback(async (id, data) => {
    const payload = {}
    if (data?.title !== undefined) payload.titre = data.title
    if (data?.content !== undefined) payload.contenu = data.content
    const updated = await updateNoteApi(id, payload)
    const note = versForme(updated)
    setNotes((n) => n.map((x) => (x.id === id ? note : x)))
    return note
  }, [])

  const removeNote = useCallback(async (id) => {
    await deleteNote(id)
    setNotes((n) => n.filter((note) => note.id !== id))
  }, [])

  const value = useMemo(() => ({ notes, addNote, updateNote, removeNote }), [notes, addNote, updateNote, removeNote])

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

export function useNotes() {
  const ctx = useContext(NotesContext)
  if (!ctx) throw new Error('useNotes doit être utilisé dans NotesProvider')
  return ctx
}
