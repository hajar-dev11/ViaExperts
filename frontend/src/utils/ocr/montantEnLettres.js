// Montant écrit en toutes lettres sur une facture (« Neuf cent trente DIRHAMS, deux CENTIMES » = 930,02) : sert à CONTRÔLER le TTC
// lu par OCR. Fonction pure ; au moindre mot inconnu dans la phrase, elle renvoie `null` (rien n'est deviné).

const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const UNITES = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16,
}
const DIZAINES = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 }

/** Mots (sans trait d'union ni « et ») → entier, ou `null` si un mot est inconnu ou la phrase vide. */
export function nombreEnLettres(mots) {
  const jetons = mots.filter((m) => m && m !== 'et')
  if (jetons.length === 0) return null
  let total = 0
  let courant = 0
  for (let i = 0; i < jetons.length; i += 1) {
    const m = jetons[i]
    if (m in UNITES) courant += UNITES[m]
    else if (m in DIZAINES) courant += DIZAINES[m]
    else if (m === 'cent' || m === 'cents') courant = (courant === 0 ? 1 : courant) * 100
    else if (m === 'mille') { total += (courant === 0 ? 1 : courant) * 1000; courant = 0 }
    else if (m === 'million' || m === 'millions') { total += (courant === 0 ? 1 : courant) * 1_000_000; courant = 0 }
    else return null
    // « quatre-vingt » : quatre × vingt ; « soixante-dix » : soixante + dix ; « quatre-vingt-dix » : 80 + 10.
    if ((m === 'vingt' || m === 'vingts') && jetons[i - 1] === 'quatre') courant += 56 // quatre (4) + vingt (20) + 56 → 80
  }
  return total + courant
}

/**
 * Montant en toutes lettres d'une ligne : la phrase qui précède « DIRHAMS » (ou « DH », « DHS »), puis éventuellement les centimes
 * (« , deux CENTIMES », « et 50 cts »). Renvoie le montant ou `null`.
 */
export function montantEnLettres(texte) {
  const t = sansAccents(texte).replace(/[-_]/g, ' ').replace(/[,;:.]/g, ' ').replace(/\s+/g, ' ').trim()
  const m = /(.*?)\b(dirhams?|dhs?)\b(.*)$/.exec(t)
  if (!m) return null

  // Le nombre = la plus longue suite de mots-nombres juste avant « dirhams » (le début de la ligne peut être du bruit).
  const avant = m[1].split(' ').filter(Boolean)
  const valides = new Set([...Object.keys(UNITES), ...Object.keys(DIZAINES), 'cent', 'cents', 'mille', 'million', 'millions', 'et'])
  let debut = avant.length
  while (debut > 0 && valides.has(avant[debut - 1])) debut -= 1
  const entier = nombreEnLettres(avant.slice(debut))
  if (entier === null) return null

  // Centimes : mots-nombres ou chiffres avant « centimes » / « cts ».
  let centimes = 0
  const c = /^(?:\s*et)?\s*(.*?)\s*\b(centimes?|cts?)\b/.exec(m[3])
  if (c && c[1]) {
    const brut = c[1].trim()
    if (/^\d{1,2}$/.test(brut)) centimes = Number(brut)
    else if (!/^0+$/.test(brut.replace(/\s/g, ''))) {
      const n = nombreEnLettres(brut.split(' '))
      if (n === null || n > 99) return null
      centimes = n
    }
  }
  return Math.round((entier + centimes / 100) * 100) / 100
}
