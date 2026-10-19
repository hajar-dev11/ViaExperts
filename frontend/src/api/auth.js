import { apiFetch, apiUpload, ensureCsrfCookie } from './http.js'
import { preparerImage } from '../utils/images.js'

export async function login(email, password, remember = false) {
  await ensureCsrfCookie()
  const data = await apiFetch('/api/v1/auth/login', { method: 'POST', body: { email, password, remember } })
  return { user: data.user, permissions: data.permissions ?? [] }
}

export async function forgotPassword(email) {
  await ensureCsrfCookie()
  return apiFetch('/api/v1/auth/forgot-password', { method: 'POST', body: { email } })
}

export async function resetPassword({ token, email, password, password_confirmation }) {
  await ensureCsrfCookie()
  return apiFetch('/api/v1/auth/reset-password', {
    method: 'POST',
    body: { token, email, password, password_confirmation },
  })
}

export async function logout() {
  await apiFetch('/api/v1/auth/logout', { method: 'POST' })
}

export async function me() {
  const data = await apiFetch('/api/v1/auth/me', { method: 'GET' })
  return { user: data.user, permissions: data.permissions ?? [] }
}

export async function updateProfile(payload) {
  const data = await apiFetch('/api/v1/profile', { method: 'PUT', body: payload })
  return data.user
}

export async function uploadProfilePhoto(file) {
  // Une photo de téléphone dépasse la taille acceptée par le serveur : elle est réduite dans le navigateur avant l'envoi.
  const data = await apiUpload('/api/v1/profile/photo', await preparerImage(file))
  return data.user
}

export async function deleteProfilePhoto() {
  const data = await apiFetch('/api/v1/profile/photo', { method: 'DELETE' })
  return data.user
}
