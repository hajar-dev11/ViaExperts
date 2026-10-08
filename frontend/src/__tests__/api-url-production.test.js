// URL de l'API : le build de production exige une URL explicite, jamais localhost.
// Environnement Node (pas de jsdom) : fonction pure + texte source uniquement ; le build réel est vérifié séparément.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifierApiUrlProduction } from '../../vite.verification-env.js'

const FRONTEND = path.resolve(__dirname, '..', '..')
const lire = (rel) => fs.readFileSync(path.join(FRONTEND, rel), 'utf8')

describe('verifierApiUrlProduction', () => {
  it('accepte une URL publique en HTTPS', () => {
    expect(verifierApiUrlProduction('https://api.exemple.ma')).toBe('https://api.exemple.ma')
    expect(verifierApiUrlProduction('  https://api.exemple.ma/  ')).toBe('https://api.exemple.ma/')
  })

  it('refuse une URL absente, vide ou blanche avec un message clair', () => {
    for (const valeur of [undefined, null, '', '   ']) {
      expect(() => verifierApiUrlProduction(valeur)).toThrow(/VITE_API_URL n'est pas défini/)
    }
  })

  it('refuse localhost, 127.0.0.1, ::1, 0.0.0.0 et *.localhost (avec ou sans port)', () => {
    for (const valeur of ['http://localhost:8000', 'https://localhost', 'http://127.0.0.1:8000', 'http://[::1]:8000', 'http://0.0.0.0', 'http://api.localhost']) {
      expect(() => verifierApiUrlProduction(valeur), valeur).toThrow(/adresse locale/)
    }
  })

  it('refuse une valeur qui n\'est pas une URL http(s)', () => {
    expect(() => verifierApiUrlProduction('api.exemple.ma')).toThrow(/URL valide/)
    expect(() => verifierApiUrlProduction('ftp://api.exemple.ma')).toThrow(/https:\/\//)
  })

  it('refuse l\'exemple du dépôt (.env.example)', () => {
    expect(() => verifierApiUrlProduction('https://api.votre-domaine.com')).toThrow(/exemple du dépôt/)
  })
})

describe('verifierApiUrlProduction : matrice HTTPS / IP / noms réservés', () => {
  it('accepte une API publique en HTTPS (sous-domaine, port explicite, slash final)', () => {
    for (const valeur of [
      'https://api.exemple.com',
      'https://api.exemple.com/',
      'https://api.exemple.com:8443',
      'https://api.exemple.com:8443/api',
      'https://v2.api.exemple.com',
      'https://exemple.com',
      'https://api.exemple.com.',
    ]) {
      expect(verifierApiUrlProduction(valeur), valeur).toBe(valeur)
    }
  })

  it('refuse http:// (URL non chiffrée) avec un message qui demande HTTPS', () => {
    expect(() => verifierApiUrlProduction('http://api.exemple.com')).toThrow(/HTTPS/)
    expect(() => verifierApiUrlProduction('http://api.exemple.com:8080')).toThrow(/https:\/\/api\.exemple\.com:8080/)
  })

  it('refuse les adresses locales et privées, en http comme en https', () => {
    for (const valeur of [
      'http://192.168.1.10', 'https://192.168.1.10', 'http://10.0.0.5', 'https://10.1.2.3', 'http://172.16.0.9', 'https://172.31.255.1',
      'http://169.254.10.1', 'http://127.0.0.2', 'http://localhost:8000', 'http://127.0.0.1:8000', 'https://[::1]:8000',
      'https://[fc00::1]', 'https://[fd12:3456::1]', 'https://[fe80::1]', 'https://0.0.0.0',
      // Notations alternatives normalisées par URL : 2130706433 = 127.0.0.1, 0xc0a80101 = 192.168.1.1.
      'https://2130706433', 'https://0xc0a80101',
    ]) {
      expect(() => verifierApiUrlProduction(valeur), valeur).toThrow(/adresse locale ou privée/)
    }
  })

  it('refuse toute adresse IP littérale, même publique : une API de production a un nom de domaine', () => {
    for (const valeur of ['https://8.8.8.8', 'https://203.0.114.7:8443', 'https://[2001:db8::1]', 'https://[2606:4700::1111]']) {
      expect(() => verifierApiUrlProduction(valeur), valeur).toThrow(/adresse IP/)
    }
  })

  it('refuse les noms réservés aux tests / au réseau interne (http et https)', () => {
    for (const valeur of [
      'http://api.test', 'https://api.test', 'http://api.local', 'https://api.local', 'https://api.localhost',
      'https://api.localdomain', 'https://api.internal', 'https://api.lan', 'https://api.home.arpa', 'https://api.example',
      'https://API.LOCAL', 'https://api.local.',
    ]) {
      expect(() => verifierApiUrlProduction(valeur), valeur).toThrow(/adresse locale|nom réservé/)
    }
    expect(() => verifierApiUrlProduction('https://api.test')).toThrow(/nom réservé/)
  })

  it('refuse un nom sans point (« backend », « api »)', () => {
    for (const valeur of ['https://backend', 'https://api', 'https://backend:8443']) {
      expect(() => verifierApiUrlProduction(valeur), valeur).toThrow(/nom de domaine complet/)
    }
  })

  it("refuse une valeur absente, vide ou qui n'est pas une URL", () => {
    for (const valeur of [undefined, null, '', '   ']) {
      expect(() => verifierApiUrlProduction(valeur)).toThrow(/n'est pas défini/)
    }
    for (const valeur of ['pas une url', 'http://', 'https://:8000', '//api.exemple.com']) {
      expect(() => verifierApiUrlProduction(valeur), valeur).toThrow(/URL valide/)
    }
  })

  it("n'affiche jamais d'identifiants dans les messages d'erreur", () => {
    for (const valeur of ['https://admin:secret123@192.168.1.10', 'http://admin:secret123@api.exemple.com', 'https://admin:secret123@api.test']) {
      let message = ''
      try { verifierApiUrlProduction(valeur) } catch (e) { message = e.message }
      expect(message, valeur).not.toBe('')
      expect(message, valeur).not.toMatch(/secret123|admin/)
    }
    // Identifiants sur une URL par ailleurs valide : refusés (le code du site est public).
    expect(() => verifierApiUrlProduction('https://admin:secret123@api.exemple.com')).toThrow(/identifiants/)
  })

  it('tous les messages sont en français et expliquent quoi faire', () => {
    for (const valeur of ['http://api.exemple.com', 'https://10.0.0.1', 'https://8.8.8.8', 'https://api.test', 'https://backend', '']) {
      expect(() => verifierApiUrlProduction(valeur), valeur).toThrow(/Build de production arrêté/)
    }
  })
})

describe('Branchement du garde-fou', () => {
  it('http.js : le repli localhost n\'existe que sous import.meta.env.DEV', () => {
    const source = lire('src/api/http.js')
    const ligne = source.split('\n').find((l) => l.startsWith('export const API_URL'))

    expect(ligne).toBeDefined()
    expect(ligne).toMatch(/import\.meta\.env\.DEV\s*\?\s*'http:\/\/localhost:8000'\s*:\s*''/)
    // Aucune autre occurrence du repli dans le fichier (hors commentaires).
    const code = source.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code.match(/localhost:8000/g)).toHaveLength(1)
  })

  it("vite.config.js : le garde ne s'applique qu'au build de production (npm run dev inchangé)", () => {
    const config = lire('vite.config.js')
    expect(config).toMatch(/if \(command === 'build' && mode === 'production'\) \{\s*verifierApiUrlProduction/)
  })

  it('vite.config.js : le build de production vérifie VITE_API_URL', () => {
    const config = lire('vite.config.js')
    expect(config).toContain("command === 'build' && mode === 'production'")
    expect(config).toContain('verifierApiUrlProduction')
  })
})
