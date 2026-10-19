// Upload des photos et images : réduction avant envoi, messages d'erreur en français, comportement de apiUpload.
// Environnement Node (pas de jsdom) : le chargement d'image et le canvas sont remplacés par des doublures.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiUpload, messageEchecEnvoi } from '../api/http.js'
import { uploadProfilePhoto } from '../api/auth.js'
import { COTE_MAX, TAILLE_CIBLE, formaterTaille, preparerImage } from '../utils/images.js'

const octets = (n) => new Uint8Array(n)
const fichier = (nom, type, taille) => new File([octets(taille)], nom, { type })

/** Doublure du navigateur : taille de l'image produite proportionnelle aux pixels et au format. */
function doublures({ largeur = 4000, hauteur = 3000, png = 0.5, jpeg = 0.1, echecChargement = false, toujoursGros = false } = {}) {
  const canvases = []
  const liberer = vi.fn()
  return {
    canvases,
    liberer,
    charger: async () => {
      if (echecChargement) throw new Error('illisible')
      return { source: {}, largeur, hauteur, liberer }
    },
    creerCanvas: () => {
      const c = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(_v) {} }) }
      canvases.push(c)
      return c
    },
    encoder: async (canvas, type, qualite = 1) => {
      const taille = toujoursGros ? 5 * 1024 * 1024 : Math.round(canvas.width * canvas.height * (type === 'image/png' ? png : jpeg * qualite))
      return new Blob([octets(taille)], { type })
    },
  }
}

describe('preparerImage', () => {
  it("garde le fichier d'origine quand il est déjà léger", async () => {
    const f = fichier('petite.jpg', 'image/jpeg', 200 * 1024)
    expect(await preparerImage(f, doublures())).toBe(f)
  })

  it('réduit une photo lourde : côté max 1600, JPEG, sous la taille visée', async () => {
    const d = doublures({ largeur: 4000, hauteur: 3000 })
    const sortie = await preparerImage(fichier('IMG_2041.jpeg', 'image/jpeg', 5 * 1024 * 1024), d)

    expect(sortie.type).toBe('image/jpeg')
    expect(sortie.name).toBe('IMG_2041.jpg')
    expect(sortie.size).toBeLessThanOrEqual(TAILLE_CIBLE)
    const c = d.canvases[0]
    expect(Math.max(c.width, c.height)).toBe(COTE_MAX)
    expect(c.width / c.height).toBeCloseTo(4 / 3, 2)
    expect(d.liberer).toHaveBeenCalledTimes(1)
  })

  it('ne grossit jamais une image plus petite que la limite de côté', async () => {
    const d = doublures({ largeur: 800, hauteur: 600, jpeg: 2 })
    await preparerImage(fichier('p.jpg', 'image/jpeg', 3 * 1024 * 1024), d)
    expect(d.canvases[0].width).toBe(800)
    expect(d.canvases[0].height).toBe(600)
  })

  it('garde le PNG (transparence) quand la version réduite tient dans la taille visée', async () => {
    const sortie = await preparerImage(fichier('logo.png', 'image/png', 3 * 1024 * 1024), doublures({ largeur: 2400, hauteur: 1600 }))
    expect(sortie.type).toBe('image/png')
    expect(sortie.name).toBe('logo.png')
    expect(sortie.size).toBeLessThanOrEqual(TAILLE_CIBLE)
  })

  it('retombe sur du JPEG quand le PNG ne peut pas devenir assez léger', async () => {
    const sortie = await preparerImage(fichier('photo.png', 'image/png', 4 * 1024 * 1024), doublures({ png: 50 }))
    expect(sortie.type).toBe('image/jpeg')
    expect(sortie.name).toBe('photo.jpg')
  })

  it('convertit WebP (non accepté par le serveur) même quand il est léger', async () => {
    const f = fichier('photo.webp', 'image/webp', 100 * 1024)
    const sortie = await preparerImage(f, doublures({ largeur: 1000, hauteur: 800 }))
    expect(sortie).not.toBe(f)
    expect(['image/png', 'image/jpeg']).toContain(sortie.type)
  })

  it('refuse un format non pris en charge avec un message en français', async () => {
    await expect(preparerImage(fichier('doc.pdf', 'application/pdf', 1000), doublures()))
      .rejects.toMatchObject({ name: 'Error', message: expect.stringContaining('Format non pris en charge') })
    await expect(preparerImage(fichier('x.svg', 'image/svg+xml', 1000), doublures())).rejects.toBeInstanceOf(ApiError)
  })

  it('refuse une image démesurée sans la charger en mémoire', async () => {
    const charger = vi.fn()
    const gros = { name: 'enorme.jpg', type: 'image/jpeg', size: 31 * 1024 * 1024 }
    await expect(preparerImage(gros, { charger })).rejects.toThrow(/trop lourde/)
    expect(charger).not.toHaveBeenCalled()
  })

  it('signale une image illisible', async () => {
    await expect(preparerImage(fichier('cassee.jpg', 'image/jpeg', 2 * 1024 * 1024), doublures({ echecChargement: true })))
      .rejects.toThrow(/illisible ou corrompue/)
  })

  it("signale une image impossible à alléger, sans boucle infinie", async () => {
    const d = doublures({ toujoursGros: true })
    await expect(preparerImage(fichier('lourde.jpg', 'image/jpeg', 8 * 1024 * 1024), d)).rejects.toThrow(/Impossible de réduire/)
    expect(d.canvases.length).toBeLessThanOrEqual(10)
    expect(d.liberer).toHaveBeenCalledTimes(1)
  })

  it('refuse un envoi vide', async () => {
    await expect(preparerImage(null)).rejects.toThrow(/Aucune image/)
  })
})

describe('formaterTaille', () => {
  it('écrit les tailles en Ko / Mo à la française', () => {
    expect(formaterTaille(300 * 1024)).toBe('300 Ko')
    expect(formaterTaille(1.5 * 1024 * 1024)).toBe('1,5 Mo')
  })
})

describe('messageEchecEnvoi', () => {
  it('préfère le message de validation du serveur', () => {
    expect(messageEchecEnvoi(422, { message: 'x', errors: { file: ["L'image dépasse 2 Mo."] } })).toBe("L'image dépasse 2 Mo.")
    expect(messageEchecEnvoi(422, { message: 'Message du serveur' })).toBe('Message du serveur')
  })

  it("explique les échecs sans corps JSON (limite de taille, session, droits, erreur serveur)", () => {
    expect(messageEchecEnvoi(413, null)).toMatch(/trop volumineux/)
    expect(messageEchecEnvoi(419, null)).toMatch(/session a expiré/)
    expect(messageEchecEnvoi(403, null)).toMatch(/pas le droit/)
    expect(messageEchecEnvoi(500, null)).toMatch(/erreur 500/)
    expect(messageEchecEnvoi(502, null)).toMatch(/erreur 502/)
  })
})

describe('apiUpload', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const reponse = (status, corps) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => { if (corps === undefined) throw new Error('pas de JSON'); return corps },
  })

  function installer(reponseEnvoi) {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=jeton' })
    const appels = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      appels.push({ url: String(url), options })
      if (String(url).includes('csrf-cookie')) return reponse(204, null)
      if (reponseEnvoi instanceof Error) throw reponseEnvoi
      return reponseEnvoi
    }))
    return appels
  }

  it('envoie le fichier sous le champ « file » avec le jeton CSRF et les cookies', async () => {
    const appels = installer(reponse(200, { user: { photo_path: 'profiles/a.jpg' } }))
    const f = fichier('a.jpg', 'image/jpeg', 100)

    const data = await apiUpload('/api/v1/profile/photo', f)

    expect(data.user.photo_path).toBe('profiles/a.jpg')
    const envoi = appels.find((a) => a.url.endsWith('/api/v1/profile/photo'))
    expect(envoi.options.method).toBe('POST')
    expect(envoi.options.credentials).toBe('include')
    expect(envoi.options.headers['X-XSRF-TOKEN']).toBe('jeton')
    expect(envoi.options.body.get('file').name).toBe('a.jpg')
  })

  it('transmet le premier message de validation du serveur', async () => {
    installer(reponse(422, { message: 'x', errors: { file: ["L'image dépasse 2 Mo. Choisissez une image plus légère."] } }))
    await expect(apiUpload('/api/v1/profile/photo', fichier('a.jpg', 'image/jpeg', 1)))
      .rejects.toMatchObject({ status: 422, message: "L'image dépasse 2 Mo. Choisissez une image plus légère." })
  })

  it('explique une réponse 413 sans corps JSON', async () => {
    installer(reponse(413, undefined))
    await expect(apiUpload('/api/v1/profile/photo', fichier('a.jpg', 'image/jpeg', 1)))
      .rejects.toMatchObject({ status: 413, message: expect.stringContaining('trop volumineux') })
  })

  it('explique une erreur 500 sans corps JSON (page Apache)', async () => {
    installer(reponse(500, undefined))
    await expect(apiUpload('/api/v1/profile/photo', fichier('a.jpg', 'image/jpeg', 1)))
      .rejects.toMatchObject({ status: 500, message: expect.stringContaining("n'a pas pu enregistrer le fichier") })
  })

  it("explique l'absence totale de réponse (réseau, CORS)", async () => {
    installer(new TypeError('Failed to fetch'))
    await expect(apiUpload('/api/v1/profile/photo', fichier('a.jpg', 'image/jpeg', 1)))
      .rejects.toMatchObject({ status: 0, message: expect.stringContaining('impossible de contacter le serveur') })
  })
})

describe('uploadProfilePhoto', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("envoie telle quelle une photo déjà légère et renvoie l'utilisateur mis à jour", async () => {
    vi.stubGlobal('document', { cookie: '' })
    let corps = null
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).includes('csrf-cookie')) return { ok: true, status: 204, json: async () => null }
      corps = options.body
      return { ok: true, status: 200, json: async () => ({ user: { id: 1, photo_path: 'profiles/x.jpg' } }) }
    }))

    const user = await uploadProfilePhoto(fichier('moi.jpg', 'image/jpeg', 120 * 1024))

    expect(user.photo_path).toBe('profiles/x.jpg')
    expect(corps.get('file').name).toBe('moi.jpg')
    expect(corps.get('file').size).toBe(120 * 1024)
  })

  it("n'envoie rien quand le format n'est pas une image", async () => {
    const envoi = vi.fn()
    vi.stubGlobal('document', { cookie: '' })
    vi.stubGlobal('fetch', envoi)

    await expect(uploadProfilePhoto(fichier('cv.pdf', 'application/pdf', 1000))).rejects.toThrow(/Format non pris en charge/)
    expect(envoi).not.toHaveBeenCalled()
  })
})
