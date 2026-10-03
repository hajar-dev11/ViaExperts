import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as authApi from '../api/auth.js'
import { setUnauthorizedHandler } from '../api/http.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  // Lu par le handler 401 ci-dessous sans le remettre en dépendance : on veut
  // toujours la dernière valeur, pas celle capturée à l'enregistrement du handler.
  const userRef = useRef(null)
  useEffect(() => { userRef.current = user }, [user])

  useEffect(() => {
    authApi.me()
      .then(({ user: u, permissions: p }) => { setUser(u); setPermissions(p) })
      .catch(() => { setUser(null); setPermissions([]) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // Un 401 ne déclenche la déconnexion que si on se croyait authentifié :
    // ignore donc le 401 attendu du visiteur anonyme sur une page publique
    // (pas de redirection, pas de boucle — `user` est déjà `null`), et ne
    // redirige qu'une fois (`user` repasse à `null` dès le premier appel).
    setUnauthorizedHandler(() => {
      if (userRef.current) {
        setUser(null)
        setPermissions([])
        if (!window.location.hash.startsWith('#/login')) {
          window.location.hash = '/login'
        }
      }
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (email, password, remember = false) => {
    const { user: u, permissions: p } = await authApi.login(email, password, remember)
    setUser(u)
    setPermissions(p)
    return u
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setPermissions([])
    }
  }, [])

  const updateProfile = useCallback(async (payload) => {
    const u = await authApi.updateProfile(payload)
    setUser(u)
    return u
  }, [])

  const uploadPhoto = useCallback(async (file) => {
    const u = await authApi.uploadProfilePhoto(file)
    setUser(u)
    return u
  }, [])

  const deletePhoto = useCallback(async () => {
    const u = await authApi.deleteProfilePhoto()
    setUser(u)
    return u
  }, [])

  // Même sémantique que `User::hasPermission()` côté backend : un admin passe
  // toujours, un non-admin doit avoir la ligne (module, action) exacte.
  const permissionSet = useMemo(
    () => new Set(permissions.map((p) => `${p.module}:${p.action}`)),
    [permissions]
  )
  const hasPermission = useCallback(
    (module, action) => !!user?.is_admin || permissionSet.has(`${module}:${action}`),
    [user, permissionSet]
  )

  const value = useMemo(
    () => ({
      user, loading, isAuthenticated: !!user, login, logout, updateProfile, uploadPhoto, deletePhoto,
      hasPermission,
    }),
    [user, loading, login, logout, updateProfile, uploadPhoto, deletePhoto, hasPermission]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
