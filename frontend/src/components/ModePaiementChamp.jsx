import { ChevronDown } from 'lucide-react'
import { Field, Input, Select } from './Field.jsx'
import { MODES_PAIEMENT } from '../shared/constants/documents.js'
import {
  LONGUEUR_MAX_PRECISION, MODE_A_DETERMINER, composerModeAutre, estModeAutre, precisionModeAutre,
} from '../utils/modePaiement.js'

/**
 * Champ « Mode de Paiement » partagé par tous les formulaires (domiciliation, renouvellement, entreprise, facture, paiement).
 *
 * UN SEUL champ : la liste des modes existants, sans en inventer. Quand « Autres à déterminer » est choisi, la liste laisse
 * la place à la SAISIE de la précision dans ce même champ (préfixe « Autre : »), avec un bouton pour revenir à la liste. La
 * valeur est enregistrée sous la forme « Autre : <précision> » dans la même colonne, et réaffichée telle quelle à la consultation
 * et à la modification (le champ s'ouvre directement sur la précision enregistrée). Aucun deuxième champ n'est ajouté.
 *
 * `value` / `onChange(valeur)` : la valeur du champ (chaîne), pas un événement.
 */
export default function ModePaiementChamp({
  value, onChange, label = 'Mode de Paiement', icon, className = '', vide = 'Au choix du client', error, children,
}) {
  const autre = estModeAutre(value)

  return (
    <div className={className}>
      <Field label={label} error={error}>
        {autre ? (
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              {/* Sans icône propre au formulaire, un préfixe rappelle qu'il s'agit du mode « Autre ». */}
              {!icon && (
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[15px] text-ink-600">Autre :</span>
              )}
              <Input
                icon={icon}
                autoFocus={value === MODE_A_DETERMINER}
                value={precisionModeAutre(value)}
                maxLength={LONGUEUR_MAX_PRECISION}
                placeholder="Précisez le mode de paiement"
                aria-label="Précisez le mode de paiement"
                className={icon ? '' : 'pl-[4.75rem]'}
                onChange={(e) => onChange(composerModeAutre(e.target.value))}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange('')}
              title="Revenir à la liste des modes de paiement"
              aria-label="Revenir à la liste des modes de paiement"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-white text-ink-800 transition-colors hover:border-brand-300 hover:text-brand-600 focus-ring"
            >
              <ChevronDown size={18} />
            </button>
          </div>
        ) : (
          <Select icon={icon} value={value || ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">{vide}</option>
            {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        )}
      </Field>
      {children}
    </div>
  )
}
