import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import Login from './pages/Login.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ClientsList from './pages/ClientsList.jsx'
import ClientForm from './pages/ClientForm.jsx'
import ClientDetails from './pages/ClientDetails.jsx'
import EntreprisesList from './pages/EntreprisesList.jsx'
import EntrepriseForm from './pages/EntrepriseForm.jsx'
import EntrepriseDetails from './pages/EntrepriseDetails.jsx'
import { EntreprisesListeNoire, EntreprisesBloquees } from './pages/EntreprisesSituation.jsx'
import {
  DomiciliationList, DomiciliationForm, DomiciliationDetails, AttestationDomiciliation, ContratDomiciliation,
  ProcurationDomiciliation, DomiciliationStatuts, DomiciliationCalendar, DomiciliationCentres, CentreDomiciliationDetails,
} from './modules/domiciliation/index.js'
import Chat from './pages/Chat.jsx'
import ServicesList from './pages/ServicesList.jsx'
import ServicesEnCours from './pages/ServicesEnCours.jsx'
import { DocumentList, DocumentForm } from './modules/facturation/index.js'
import PaiementList from './pages/PaiementList.jsx'
import PaiementForm from './pages/PaiementForm.jsx'
import PaiementGestion from './pages/PaiementGestion.jsx'
import { MouvementRecu, MouvementFacture } from './pages/Mouvement.jsx'
import { DeclarationForm, DeclarationList, ChiffreAffairesForm, ChiffreAffairesList } from './pages/DeclarationTVA.jsx'
import { RapportForm, RapportList } from './pages/Rapports.jsx'
import Cachets from './pages/Cachets.jsx'
import Mails from './pages/Mails.jsx'
import DataCenter from './pages/DataCenter.jsx'
import Archive, { Corbeille } from './pages/Archive.jsx'
import Parametres from './pages/Parametres.jsx'
import Fichiers from './pages/Fichiers.jsx'
import Notes from './pages/Notes.jsx'
import NotFound from './pages/NotFound.jsx'
import { FilesProvider } from './context/FilesContext.jsx'
import { NotesProvider } from './context/NotesContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ToastProvider } from './components/ui/Toast.jsx'

export default function App() {
  return (
    <ToastProvider>
    <AuthProvider>
    <FilesProvider>
    <NotesProvider>
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/clients" element={<ClientsList />} />
          <Route path="/clients/nouveau" element={<ClientForm />} />
          <Route path="/clients/:id/modifier" element={<ClientForm />} />
          <Route path="/clients/:id" element={<ClientDetails />} />

          <Route path="/entreprises" element={<EntreprisesList />} />
          <Route path="/entreprises/nouvelle" element={<EntrepriseForm />} />
          <Route path="/entreprises/:id/modifier" element={<EntrepriseForm />} />
          <Route path="/entreprises/:id" element={<EntrepriseDetails />} />
          <Route path="/entreprises-liste-noire" element={<EntreprisesListeNoire />} />
          <Route path="/entreprises-bloquees" element={<EntreprisesBloquees />} />

          <Route path="/domiciliation" element={<DomiciliationList />} />
          {/* `key` : « Nouvelle » repart toujours d'un formulaire neuf (« Ajouter Signature » coché par défaut), sans reprendre l'état d'une modification. */}
          <Route path="/domiciliation/nouvelle" element={<DomiciliationForm key="domiciliation-nouvelle" />} />
          <Route path="/domiciliation/:id/modifier" element={<DomiciliationForm key="domiciliation-modifier" />} />
          <Route path="/domiciliation/liste" element={<DomiciliationStatuts />} />
          <Route path="/domiciliation/calendrier" element={<DomiciliationCalendar />} />
          <Route path="/domiciliation/centres" element={<DomiciliationCentres />} />
          <Route path="/domiciliation/centres/:id" element={<CentreDomiciliationDetails />} />
          <Route path="/domiciliation/:id/attestation" element={<AttestationDomiciliation />} />
          <Route path="/domiciliation/:id/contrat" element={<ContratDomiciliation />} />
          <Route path="/domiciliation/:id/procuration" element={<ProcurationDomiciliation />} />
          <Route path="/domiciliation/:id" element={<DomiciliationDetails />} />

          <Route path="/chat" element={<Chat />} />

          <Route path="/services" element={<ServicesList />} />
          <Route path="/services-en-cours" element={<ServicesEnCours />} />

          {/* `key` distinct par route sur DocumentList ET DocumentForm : sans lui, React
              réutilise la même instance en navigant entre ces routes (même composant,
              seuls les props changent) et son state local — recherche, filtre
              Responsable, Numéro — survit au changement de type au lieu de repartir à
              zéro. */}
          <Route path="/facturation/factures" element={<DocumentList key="facture-liste" type="facture" title="Liste des Factures" addTo="/facturation/factures/nouvelle" addLabel="Ajouter Facture" editBase="/facturation/factures" />} />
          <Route path="/facturation/factures/nouvelle" element={<DocumentForm key="facture-nouvelle" type="facture" title="Ajouter Facture" dateLabel="Date Facture" secondDateLabel="Date Paiement" listTo="/facturation/factures" />} />
          <Route path="/facturation/factures/:id/modifier" element={<DocumentForm key="facture-modifier" type="facture" title="Ajouter Facture" dateLabel="Date Facture" secondDateLabel="Date Paiement" listTo="/facturation/factures" />} />
          <Route path="/facturation/devis" element={<DocumentList key="devis-liste" type="devis" title="Liste des Devis" addTo="/facturation/devis/nouveau" addLabel="Ajouter Devis" editBase="/facturation/devis" />} />
          <Route path="/facturation/devis/nouveau" element={<DocumentForm key="devis-nouveau" type="devis" title="Ajouter Devis" dateLabel="Date Devis" listTo="/facturation/devis" />} />
          <Route path="/facturation/devis/:id/modifier" element={<DocumentForm key="devis-modifier" type="devis" title="Ajouter Devis" dateLabel="Date Devis" listTo="/facturation/devis" />} />
          <Route path="/facturation/bon-livraison" element={<DocumentList key="bl-liste" type="bl" title="Liste des Bon de Livraison" addTo="/facturation/bon-livraison/nouveau" addLabel="Ajouter Bon de Livraison" editBase="/facturation/bon-livraison" />} />
          <Route path="/facturation/bon-livraison/nouveau" element={<DocumentForm key="bl-nouveau" type="bl" title="Ajouter Bon de Livraison" dateLabel="Date Bon Livraison" listTo="/facturation/bon-livraison" />} />
          <Route path="/facturation/bon-livraison/:id/modifier" element={<DocumentForm key="bl-modifier" type="bl" title="Ajouter Bon de Livraison" dateLabel="Date Bon Livraison" listTo="/facturation/bon-livraison" />} />
          <Route path="/facturation/avoir" element={<DocumentList key="avoir-liste" type="avoir" title="Liste des Factures d'Avoir" addTo="/facturation/avoir/nouveau" addLabel="Ajouter Facture d'Avoir" editBase="/facturation/avoir" />} />
          <Route path="/facturation/avoir/nouveau" element={<DocumentForm key="avoir-nouveau" type="avoir" title="Ajouter Facture d'Avoir" dateLabel="Date Facture d'Avoir" listTo="/facturation/avoir" />} />
          <Route path="/facturation/avoir/:id/modifier" element={<DocumentForm key="avoir-modifier" type="avoir" title="Ajouter Facture d'Avoir" dateLabel="Date Facture d'Avoir" listTo="/facturation/avoir" />} />

          <Route path="/paiement" element={<PaiementList />} />
          <Route path="/paiement/nouveau" element={<PaiementForm />} />
          <Route path="/paiement/gestion" element={<PaiementGestion />} />
          <Route path="/paiement/:id/modifier" element={<PaiementForm />} />

          <Route path="/mouvement/recu" element={<MouvementRecu />} />
          <Route path="/mouvement/facture" element={<MouvementFacture />} />

          <Route path="/declaration-tva" element={<DeclarationList />} />
          {/* `key` distinct par route, même motif que Facturation (App.jsx plus
              haut) : sans lui, React réutilise la même instance de Formulaire
              en naviguant nouvelle ↔ modifier et son state peut ne pas repartir
              à vide. */}
          <Route path="/declaration-tva/nouvelle" element={<DeclarationForm key="tva-nouvelle" />} />
          <Route path="/declaration-tva/chiffre-affaires" element={<ChiffreAffairesList />} />
          <Route path="/declaration-tva/chiffre-affaires/nouveau" element={<ChiffreAffairesForm key="ca-nouveau" />} />
          <Route path="/declaration-tva/chiffre-affaires/:id/modifier" element={<ChiffreAffairesForm key="ca-modifier" />} />
          <Route path="/declaration-tva/:id/modifier" element={<DeclarationForm key="tva-modifier" />} />

          <Route path="/rapports" element={<RapportList />} />
          <Route path="/rapports/nouveau" element={<RapportForm />} />
          <Route path="/rapports/:id/modifier" element={<RapportForm />} />

          <Route path="/cachets" element={<Cachets />} />
          <Route path="/mails" element={<Mails />} />
          <Route path="/data-center" element={<DataCenter />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/corbeille" element={<Corbeille />} />
          <Route path="/fichiers" element={<Fichiers />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/parametres" element={<Parametres />} />
          <Route path="/parametres/:section" element={<Parametres />} />

          {/* URL inconnue : page 404 dans le Layout (menu visible). Toujours en DERNIER ; hors connexion, RequireAuth renvoie vers /login. */}
          <Route path="*" element={<NotFound />} />
        </Route>
        </Route>
      </Routes>
    </HashRouter>
    </NotesProvider>
    </FilesProvider>
    </AuthProvider>
    </ToastProvider>
  )
}
