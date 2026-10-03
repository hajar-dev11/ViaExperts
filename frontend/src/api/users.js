import { apiFetch } from './http.js'

export async function listUsers() {
  const data = await apiFetch('/api/v1/users')
  return data.data
}

export async function createUser(payload) {
  const data = await apiFetch('/api/v1/users', { method: 'POST', body: payload })
  return data.data
}

export async function updateUser(id, payload) {
  const data = await apiFetch(`/api/v1/users/${id}`, { method: 'PUT', body: payload })
  return data.data
}

export async function deleteUser(id) {
  await apiFetch(`/api/v1/users/${id}`, { method: 'DELETE' })
}

export async function listPermissions() {
  return apiFetch('/api/v1/permissions')
}

export async function getUserPermissions(userId) {
  return apiFetch(`/api/v1/users/${userId}/permissions`)
}

export async function updateUserPermissions(userId, permissionIds) {
  const data = await apiFetch(`/api/v1/users/${userId}/permissions`, {
    method: 'PUT',
    body: { permissions: permissionIds },
  })
  return data.data
}
