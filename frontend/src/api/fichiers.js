import { apiFetch, apiUpload } from './http.js'

export async function listFichiers() {
  return apiFetch('/api/v1/fichiers')
}

export async function uploadFichiers(fileList) {
  const form = new FormData()
  Array.from(fileList).forEach((file) => form.append('fichiers[]', file))
  return apiUpload('/api/v1/fichiers', form)
}

export async function deleteFichier(id) {
  return apiFetch(`/api/v1/fichiers/${id}`, { method: 'DELETE' })
}
