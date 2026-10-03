/**
 * Design system Via Experts — point d'entrée unique.
 *
 *   import { Button, Card, Badge, Table, useToast } from '../components/ui/index.js'
 *
 * Les composants historiques restent importables par leur chemin d'origine
 * (`components/DataTable.jsx`, `components/Field.jsx`, …) : leurs API sont
 * inchangées, ils s'appuient simplement sur ce système.
 */

export { default as Button, IconButton } from './Button.jsx'
export { default as Card, CardHeader, CardBody, CardFooter } from './Card.jsx'
export { default as Badge } from './Badge.jsx'
export { default as Alert } from './Alert.jsx'
export { default as Modal } from './Modal.jsx'
export { default as Table } from './Table.jsx'
export { default as Pagination } from './Pagination.jsx'
export { default as ActionMenu } from './ActionMenu.jsx'
export { default as Skeleton, SkeletonText, SkeletonTable, SkeletonCard } from './Skeleton.jsx'
export { ToastProvider, useToast } from './Toast.jsx'

// Composants partagés déjà présents, réalignés sur le design system.
export { default as StatusBadge } from '../StatusBadge.jsx'
export { default as EmptyState } from '../EmptyState.jsx'
export { default as ConfirmDialog } from '../ConfirmDialog.jsx'
export {
  Field,
  Input,
  Select,
  Textarea,
  Checkbox,
  Radio,
  Switch,
  RadioCard,
  CheckboxCard,
  SectionDivider,
  FormCard,
} from '../Field.jsx'
