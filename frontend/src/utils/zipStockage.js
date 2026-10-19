// Archive ZIP minimale, sans dépendance : fichiers STOCKÉS (non compressés), noms en UTF-8, CRC-32 réel.
// Suffit pour les exports de la Déclaration TVA (quelques Ko) et pour les paquets OOXML (.xlsx est un ZIP).

const TABLE_CRC = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

/** CRC-32 (IEEE 802.3) d'un tableau d'octets. */
export function crc32(octets) {
  let crc = 0xffffffff
  for (let i = 0; i < octets.length; i += 1) crc = TABLE_CRC[(crc ^ octets[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const encodeur = new TextEncoder()
export const enOctets = (texte) => encodeur.encode(texte)

/** Date / heure au format MS-DOS (2 octets chacune), sur l'heure locale. */
function horodatageDos(date) {
  const annee = Math.max(1980, date.getFullYear())
  return {
    date: ((annee - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    heure: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  }
}

/**
 * @param {Array<{ nom: string, donnees: string | Uint8Array }>} fichiers
 * @param {Date} [maintenant]
 * @returns {Uint8Array} archive ZIP complète
 */
export function creerZip(fichiers, maintenant = new Date()) {
  const { date, heure } = horodatageDos(maintenant)
  const morceaux = []
  const annuaire = []
  let decalage = 0

  fichiers.forEach(({ nom, donnees }) => {
    const nomOctets = enOctets(nom)
    const contenu = typeof donnees === 'string' ? enOctets(donnees) : donnees
    const crc = crc32(contenu)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // version nécessaire
    local.setUint16(6, 0x0800, true) // noms en UTF-8
    local.setUint16(8, 0, true) // méthode : stockée
    local.setUint16(10, heure, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, contenu.length, true)
    local.setUint32(22, contenu.length, true)
    local.setUint16(26, nomOctets.length, true)
    local.setUint16(28, 0, true)
    morceaux.push(new Uint8Array(local.buffer), nomOctets, contenu)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true) // version de création
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, heure, true)
    central.setUint16(14, date, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, contenu.length, true)
    central.setUint32(24, contenu.length, true)
    central.setUint16(28, nomOctets.length, true)
    // extra, commentaire, disque, attributs : 0
    central.setUint32(42, decalage, true)
    annuaire.push(new Uint8Array(central.buffer), nomOctets)

    decalage += 30 + nomOctets.length + contenu.length
  })

  const tailleAnnuaire = annuaire.reduce((somme, m) => somme + m.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(8, fichiers.length, true)
  fin.setUint16(10, fichiers.length, true)
  fin.setUint32(12, tailleAnnuaire, true)
  fin.setUint32(16, decalage, true)

  const tous = [...morceaux, ...annuaire, new Uint8Array(fin.buffer)]
  const archive = new Uint8Array(tous.reduce((somme, m) => somme + m.length, 0))
  let position = 0
  tous.forEach((m) => { archive.set(m, position); position += m.length })
  return archive
}
