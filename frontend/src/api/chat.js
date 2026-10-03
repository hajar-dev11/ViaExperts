import { apiFetch, apiUpload } from './http.js'

export async function listContacts() {
  return apiFetch('/api/v1/chat/contacts')
}

export async function listMessages(userId) {
  return apiFetch(`/api/v1/chat/${userId}/messages`)
}

/** `fichier` (optionnel) : passe en multipart dès qu'il y en a un. */
export async function sendMessage(userId, body, fichier = null) {
  if (!fichier) {
    return apiFetch(`/api/v1/chat/${userId}/messages`, { method: 'POST', body: { body } })
  }
  const form = new FormData()
  if (body) form.append('body', body)
  form.append('fichier', fichier)
  return apiUpload(`/api/v1/chat/${userId}/messages`, form)
}

export async function updateMessage(messageId, body) {
  return apiFetch(`/api/v1/chat/messages/${messageId}`, { method: 'PUT', body: { body } })
}

export async function deleteMessage(messageId) {
  return apiFetch(`/api/v1/chat/messages/${messageId}`, { method: 'DELETE' })
}
