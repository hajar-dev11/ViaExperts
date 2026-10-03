import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { listFichiers, uploadFichiers, deleteFichier } from '../api/fichiers.js'
import { API_URL } from '../api/http.js'
import { useAuth } from './AuthContext.jsx'

const FilesContext = createContext(null)

// Convertit la forme de l'API (nom/chemin/mime/taille/addedAt) vers la forme
// historique consommée par `Fichiers.jsx` et la Topbar (name/size/type/url).
function versForme(f) {
  return {
    id: f.id,
    name: f.nom,
    size: f.taille,
    type: f.mime || 'application/octet-stream',
    addedAt: f.addedAt,
    addedBy: f.addedBy,
    url: `${API_URL}/storage/${f.chemin}`,
  }
}

export function FilesProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [files, setFiles] = useState([])

  useEffect(() => {
    // Pages publiques (login/mot de passe oublié/réinitialisation) : pas
    // d'utilisateur connu, donc pas d'appel vers un endpoint protégé qui
    // échouerait systématiquement en 401.
    if (!isAuthenticated) {
      setFiles([])
      return
    }
    listFichiers().then((data) => setFiles(data.map(versForme))).catch(() => {})
  }, [isAuthenticated])

  // Réellement enregistré côté serveur (Storage::disk('public')) : reste
  // disponible après un refresh ou une fermeture/réouverture de l'application.
  const addFiles = useCallback(async (fileList) => {
    const crees = await uploadFichiers(fileList)
    const items = crees.map(versForme)
    setFiles((f) => [...items, ...f])
    return items
  }, [])

  const removeFile = useCallback(async (id) => {
    await deleteFichier(id)
    setFiles((f) => f.filter((x) => x.id !== id))
  }, [])

  const value = useMemo(() => ({ files, addFiles, removeFile }), [files, addFiles, removeFile])

  return <FilesContext.Provider value={value}>{children}</FilesContext.Provider>
}

export function useFiles() {
  const ctx = useContext(FilesContext)
  if (!ctx) throw new Error('useFiles doit être utilisé dans FilesProvider')
  return ctx
}
