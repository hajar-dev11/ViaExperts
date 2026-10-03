import { apiFetch } from './http.js'

export async function listNotes() {
  return apiFetch('/api/v1/notes')
}

export async function createNote(payload) {
  return apiFetch('/api/v1/notes', { method: 'POST', body: payload })
}

export async function updateNote(id, payload) {
  return apiFetch(`/api/v1/notes/${id}`, { method: 'PUT', body: payload })
}

export async function deleteNote(id) {
  return apiFetch(`/api/v1/notes/${id}`, { method: 'DELETE' })
}
