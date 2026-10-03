import {
  LayoutDashboard, Users, Building2, MapPinned, MessageSquare, Briefcase,
  Loader, FileText, Wallet, ArrowLeftRight, ReceiptText, BellRing,
  Stamp, Mail, FolderOpen, StickyNote, Database, Archive, Trash2, Settings,
} from 'lucide-react'

export const nav = [
  { icon: LayoutDashboard, label: 'Accueil', to: '/' },
  {
    icon: Users, label: 'Clients', base: '/clients',
    children: [
      { label: 'Nouveau Client', to: '/clients/nouveau' },
      { label: 'Liste des Clients', to: '/clients' },
    ],
  },
  {
    icon: Building2, label: 'Entreprise', base: '/entreprises',
    children: [
      { label: 'Ajouter Entreprise', to: '/entreprises/nouvelle' },
      { label: 'Liste des Entreprises', to: '/entreprises' },
      { label: 'Liste Noire', to: '/entreprises-liste-noire' },
      { label: 'Entreprises Bloquées', to: '/entreprises-bloquees' },
    ],
  },
  {
    icon: MapPinned, label: 'Domiciliation', base: '/domiciliation',
    children: [
      { label: 'Nouvelle Domiciliation', to: '/domiciliation/nouvelle' },
      { label: 'Gestion Domiciliation', to: '/domiciliation' },
      { label: 'List Domiciliation', to: '/domiciliation/liste' },
      { label: 'Domiciliation Calendrier', to: '/domiciliation/calendrier' },
      { label: 'Centres des Domiciliation', to: '/domiciliation/centres' },
    ],
  },
  { icon: MessageSquare, label: 'Chat', to: '/chat' },
  { icon: Briefcase, label: 'Services', to: '/services' },
  { icon: Loader, label: 'Services En Cours', to: '/services-en-cours' },
  {
    icon: FileText, label: 'Facturation', base: '/facturation',
    children: [
      { label: 'Ajouter Facture', to: '/facturation/factures/nouvelle' },
      { label: 'Liste des Factures', to: '/facturation/factures' },
      { label: 'Ajouter Devis', to: '/facturation/devis/nouveau' },
      { label: 'Liste des Devis', to: '/facturation/devis' },
      { label: 'Ajouter Bon de Livraison', to: '/facturation/bon-livraison/nouveau' },
      { label: 'Liste des Bon de Livraison', to: '/facturation/bon-livraison' },
      { label: "Ajouter Facture d'Avoir", to: '/facturation/avoir/nouveau' },
      { label: "Liste des Factures d'Avoir", to: '/facturation/avoir' },
    ],
  },
  {
    icon: Wallet, label: 'Paiement', base: '/paiement',
    children: [
      { label: 'Ajouter Paiement', to: '/paiement/nouveau' },
      { label: 'Gestion des Paiements', to: '/paiement/gestion' },
      { label: 'List des Paiements', to: '/paiement' },
    ],
  },
  {
    icon: ArrowLeftRight, label: 'Mouvement', base: '/mouvement',
    children: [
      { label: 'Entrées (Reçu)', to: '/mouvement/recu' },
      { label: 'Entrées (Facturé)', to: '/mouvement/facture' },
    ],
  },
  {
    icon: ReceiptText, label: 'Declaration TVA', base: '/declaration-tva',
    children: [
      { label: 'Nouvelle Déclaration', to: '/declaration-tva/nouvelle' },
      { label: 'Liste des Déclarations', to: '/declaration-tva' },
      { label: "Chiffre d'Affaire", to: '/declaration-tva/chiffre-affaires/nouveau' },
      { label: "Liste des Chiffres d'Affaire", to: '/declaration-tva/chiffre-affaires' },
    ],
  },
  {
    icon: BellRing, label: 'Rapports', base: '/rapports',
    children: [
      { label: 'Ajouter Rapport', to: '/rapports/nouveau' },
      { label: 'Liste des Rapports', to: '/rapports' },
    ],
  },
  { icon: Stamp, label: 'Les Cachets', to: '/cachets' },
  { icon: Mail, label: 'Les Mails', to: '/mails' },
  { icon: FolderOpen, label: 'Fichiers', to: '/fichiers' },
  { icon: StickyNote, label: 'Notes', to: '/notes' },
  { icon: Database, label: 'Data Center', to: '/data-center' },
  { icon: Archive, label: 'Archive', to: '/archive' },
  { icon: Trash2, label: 'Corbeille', to: '/corbeille' },
  {
    icon: Settings, label: 'Paramètre', base: '/parametres',
    children: [
      // `permission` filtre dynamiquement l'entrée dans le Sidebar (voir Sidebar.jsx) :
      // un admin voit toujours tout ; un staff ne voit que ce qui lui a été accordé
      // dans Paramètres → Assistance (module `parametre`). Pas de `permission` =
      // toujours visible (ex. son propre compte).
      { label: 'Paramètre Account', to: '/parametres/compte' },
      { label: 'Bureau de Comptabilité', to: '/parametres/bureau', permission: { module: 'parametre', action: 'bureau_comptabilite' } },
      { label: 'Centre Domiciliation', to: '/parametres/centre', permission: { module: 'parametre', action: 'centre_domiciliation' } },
      { label: 'Services', to: '/parametres/services', permission: { module: 'parametre', action: 'ajouter_services_status' } },
      { label: 'Cachet', to: '/parametres/cachet', permission: { module: 'parametre', action: 'ajouter_cashet_status' } },
      { label: 'Mail', to: '/parametres/mail', permission: { module: 'parametre', action: 'ajouter_mail_status' } },
      { label: 'Assistance', to: '/parametres/assistance', permission: { module: 'parametre', action: 'ajouter_assistance' } },
    ],
  },
]
