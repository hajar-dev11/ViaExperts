import { apiFetch } from './http.js'

// Les trois catalogues de statuts (Services, Cachet, Mail) partagent exactement la même
// forme d'API côté Laravel : pagination + recherche serveur, et {nom, couleur_texte, couleur_fond}.
function makeStatusApi(resource) {
  return {
    list: ({ page = 1, perPage = 10, search = '' } = {}) => {
      const params = new URLSearchParams({ page, per_page: perPage })
      if (search) params.set('search', search)
      return apiFetch(`/api/v1/${resource}?${params.toString()}`)
    },
    create: (payload) => apiFetch(`/api/v1/${resource}`, { method: 'POST', body: payload }),
    update: (id, payload) => apiFetch(`/api/v1/${resource}/${id}`, { method: 'PUT', body: payload }),
    remove: (id) => apiFetch(`/api/v1/${resource}/${id}`, { method: 'DELETE' }),
  }
}

export const serviceStatusApi = makeStatusApi('service-statuses')
export const cachetStatusApi = makeStatusApi('cachet-statuses')
export const mailStatusApi = makeStatusApi('mail-statuses')
