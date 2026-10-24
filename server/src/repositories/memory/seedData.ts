// Jeu de démo en mémoire — strict miroir de seed.sql (mêmes ids, mêmes valeurs).
// Utilisé quand DB_DRIVER=memory. Le hash admin est calculé au démarrage
// (même mot de passe que seed.sql : hertz2025).
import { hashPassword } from "../../lib/password.js"
import type {
  AdminRecord,
  CategorieVehicule,
  Centre,
  Garage,
  PassageGarage,
  Reparation,
  Client,
  Commercial,
  Location,
  Maintenance,
  ModeleVehicule,
  Mouvement,
  Reservation,
  Vehicule,
  Prolongation,
  VenteVehicule,
} from "../types.js"

export interface SeedData {
  admin: AdminRecord
  categories: CategorieVehicule[]
  modeles: ModeleVehicule[]
  centres: Centre[]
  garages: Garage[]
  passagesGarage: PassageGarage[]
  reparations: Reparation[]
  commerciaux: Commercial[]
  clients: Client[]
  vehicules: Vehicule[]
  locations: Location[]
  prolongations: Prolongation[]
  ventesVehicules: VenteVehicule[]
  reservations: Reservation[]
  maintenances: Maintenance[]
  mouvements: Mouvement[]
}

export async function buildSeedData(): Promise<SeedData> {
  return {
    admin: {
      id: 1,
      nom: "Koffi Orou",
      email: "responsable@hertz.bj",
      role: "responsable",
      passwordHash: await hashPassword("hertz2025"),
    },
    categories: [],
    modeles: [],
    centres: [],
    garages: [
      { id: 1, nom: "Japan Motors", adresse: null, telephone: null },
      { id: 2, nom: "Garage Rousseau", adresse: null, telephone: null },
    ],
    passagesGarage: [
      {
        id: 1,
        typePassage: "REPARATION",
        dateEntree: "2026-10-14",
        dateSortiePrevue: null,
        dateSortieReelle: null,
        kmEntree: null,
        motif: "Date d'entrée inconnue (date d'enregistrement)",
        statut: "EN_COURS",
        coutTotal: 0,
        vehiculeId: 3,
        garageId: 1,
        vehicule: "CC 9082 RB",
        garage: "Japan Motors",
        vehiculeRemplacementId: null,
      },
    ],
    reparations: [],
    commerciaux: [
      { id: 1, nom: "Aïcha Sossa", contact: "a.sossa@hertz.bj" },
      { id: 2, nom: "Koffi Orou", contact: "k.orou@hertz.bj" },
      { id: 3, nom: "Mariam Bio", contact: "m.bio@hertz.bj" },
      { id: 4, nom: "David Hounkpatin", contact: "d.hounkpatin@hertz.bj" },
    ],
    clients: [
      { id: 1, nom: "Groupe Tèkponon", type: "Entreprise", telephone: "+229 01 97 12 43 08" },
      { id: 2, nom: "Sandra Adé", type: "Particulier", telephone: "+229 01 96 88 10 25" },
      { id: 3, nom: "Cabinet A2C", type: "Entreprise", telephone: "+229 01 95 32 90 11" },
      { id: 4, nom: "Jean Loko", type: "Particulier", telephone: "+229 01 97 41 22 16" },
      { id: 5, nom: "Alex Morgan", type: "Particulier", telephone: "+229 01 90 11 22 33" },
      { id: 6, nom: "Sophie Adjovi", type: "Particulier", telephone: "+229 01 91 44 55 66" },
      { id: 7, nom: "Marc Houénou", type: "Particulier", telephone: "+229 01 92 77 88 99" },
      { id: 8, nom: "Sarah Johnson", type: "Particulier", telephone: "+229 01 93 00 11 22" },
    ],
    vehicules: [
      {
        id: 1,
        immatriculation: "AA 4821 RB",
        marqueModele: "Toyota Corolla",
        categorie: "Berline",
        kilometrage: 42650,
        statut: "RESERVATION",
      },
      {
        id: 2,
        immatriculation: "BB 1374 RB",
        marqueModele: "Hyundai Tucson",
        categorie: "SUV",
        kilometrage: 28100,
        statut: "MISE_EN_LOCATION",
      },
      {
        id: 3,
        immatriculation: "CC 9082 RB",
        marqueModele: "Mercedes Classe C",
        categorie: "Premium",
        kilometrage: 35820,
        statut: "ENVOI_GARAGE",
      },
      {
        id: 4,
        immatriculation: "AB 4510 RB",
        marqueModele: "Suzuki Dzire",
        categorie: "Citadine",
        kilometrage: 51240,
        statut: "RETOUR_LOCATION",
      },
    ],
    locations: [
      {
        id: 1,
        reference: "LOC-02581",
        clientId: 1,
        vehiculeId: 2,
        commercialId: 1,
        type: "Longue durée",
        dateDebut: "2025-06-01",
        dateFin: "2025-09-30",
        montant: 6200000,
        statut: "EN_COURS",
      },
      {
        id: 2,
        reference: "LOC-02579",
        clientId: 2,
        vehiculeId: 1,
        commercialId: 2,
        type: "Courte durée",
        dateDebut: "2025-06-18",
        dateFin: "2025-06-24",
        montant: 900000,
        statut: "EN_RETARD",
      },
      {
        id: 3,
        reference: "LOC-02572",
        clientId: 3,
        vehiculeId: 3,
        commercialId: 3,
        type: "Longue durée",
        dateDebut: "2025-01-05",
        dateFin: "2025-12-31",
        montant: 9900000,
        statut: "EN_COURS",
      },
      {
        id: 4,
        reference: "LOC-02561",
        clientId: 4,
        vehiculeId: 4,
        commercialId: 1,
        type: "Courte durée",
        dateDebut: "2025-06-10",
        dateFin: "2025-06-16",
        montant: 1400000,
        statut: "TERMINEE",
      },
    ],
    prolongations: [],
    ventesVehicules: [],
    reservations: [
      {
        id: 1,
        reference: "RES-20841",
        clientId: 5,
        vehiculeId: 1,
        commercialId: 1,
        dateDepart: "2025-06-18",
        dureeJours: 3,
        statut: "Aboutie",
      },
      {
        id: 2,
        reference: "RES-20839",
        clientId: 6,
        vehiculeId: 2,
        commercialId: 2,
        dateDepart: "2025-06-18",
        dureeJours: 6,
        statut: "Confirmée",
      },
      {
        id: 3,
        reference: "RES-20835",
        clientId: 7,
        vehiculeId: null,
        commercialId: 3,
        dateDepart: "2025-06-19",
        dureeJours: 1,
        statut: "En attente",
      },
      {
        id: 4,
        reference: "RES-20828",
        clientId: 8,
        vehiculeId: 1,
        commercialId: 1,
        dateDepart: "2025-06-15",
        dureeJours: 3,
        statut: "Non aboutie",
      },
    ],
    maintenances: [
      {
        id: 1,
        vehiculeId: 3,
        dateEntree: "2025-06-10",
        dateSortie: null,
        motif: "Révision 30 000 km + plaquettes",
        cout: 185000,
        remplacementId: 4,
        statut: "En cours",
      },
    ],
    mouvements: [
      { id: 1, vehiculeId: 1, type: "ENTREE_PARC", motif: "AUTRE", kilometrage: 42650, date: "2023-03-12", commentaire: "Achat concessionnaire Cotonou" },
      { id: 2, vehiculeId: 2, type: "ENTREE_PARC", motif: "AUTRE", kilometrage: 28100, date: "2023-06-04", commentaire: "Achat concessionnaire Cotonou" },
      { id: 3, vehiculeId: 3, type: "ENTREE_PARC", motif: "AUTRE", kilometrage: 35820, date: "2022-11-20", commentaire: "Import occasion Allemagne" },
      { id: 4, vehiculeId: 4, type: "ENTREE_PARC", motif: "AUTRE", kilometrage: 51240, date: "2023-09-15", commentaire: "Achat concessionnaire Cotonou" },
      { id: 5, vehiculeId: 2, type: "MISE_EN_LOCATION", motif: "LOCATION", kilometrage: 28100, date: "2025-06-01", commentaire: "LOC-02581 Groupe Tèkponon" },
      { id: 6, vehiculeId: 4, type: "RETOUR_LOCATION", motif: "LOCATION", kilometrage: 51240, date: "2025-06-16", commentaire: "LOC-02561 Jean Loko" },
      { id: 7, vehiculeId: 3, type: "ENVOI_GARAGE", motif: "GARAGE", kilometrage: 35820, date: "2025-06-10", commentaire: "Révision 30 000 km" },
      { id: 8, vehiculeId: 1, type: "RESERVATION", motif: "LOCATION", kilometrage: 42650, date: "2025-06-17", commentaire: "Véhicule réservé pour une réservation de démonstration" },
    ],
  }
}
