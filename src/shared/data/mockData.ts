import type { TableData, TableModule } from "./types"

export const HERO_PHOTO =
  "https://images.unsplash.com/photo-1616804947838-6646ae0e423d?auto=format&fit=crop&w=1800&q=88"
export const LOGIN_PHOTO =
  "https://images.unsplash.com/photo-1617244148194-7971ce22f2fb?auto=format&fit=crop&w=1200&q=88"

export const MODULE_ICONS: Record<string, string> = {
  "Vue d’ensemble": "dashboard",
  Commerciaux: "sellers",
  Véhicules: "car",
  Locations: "rental",
  Réservations: "booking",
  Clients: "client",
  Statistiques: "stats",
}

export const mockTables: Record<TableModule, TableData> = {
  Commerciaux: {
    headers: [
      "Commercial",
      "Contact",
      "Locations conclues",
      "Chiffre d’affaires",
      "Performance",
    ],
    rows: [
      ["Aïcha Sossa", "a.sossa@hertz.bj", "38", "12 480 000 FCFA", "Excellent"],
      ["Koffi Orou", "k.orou@hertz.bj", "31", "9 760 000 FCFA", "Très bien"],
      ["Mariam Bio", "m.bio@hertz.bj", "25", "7 420 000 FCFA", "Bien"],
      [
        "David Hounkpatin",
        "d.hounkpatin@hertz.bj",
        "17",
        "5 180 000 FCFA",
        "À suivre",
      ],
    ],
  },
  Véhicules: {
    headers: [
      "Immatriculation",
      "Véhicule",
      "Catégorie",
      "Kilométrage",
      "Situation",
    ],
    rows: [
      ["AA 4821 RB", "Toyota Corolla", "Berline", "42 650 km", "Disponible"],
      ["BB 1374 RB", "Hyundai Tucson", "SUV", "28 100 km", "En location"],
      ["CC 9082 RB", "Mercedes Classe C", "Premium", "35 820 km", "Entretien"],
      ["AB 4510 RB", "Suzuki Dzire", "Citadine", "51 240 km", "Disponible"],
    ],
  },
  Locations: {
    headers: ["Contrat", "Client", "Véhicule", "Type", "Échéance", "État"],
    rows: [
      [
        "LOC-02581",
        "Groupe Tèkponon",
        "Hyundai Tucson",
        "Longue durée",
        "30/09/2025",
        "En cours",
      ],
      [
        "LOC-02579",
        "Sandra Adé",
        "Toyota Corolla",
        "Courte durée",
        "21/06/2025",
        "À retourner",
      ],
      [
        "LOC-02572",
        "Cabinet A2C",
        "Mercedes Classe C",
        "Longue durée",
        "31/12/2025",
        "En cours",
      ],
      [
        "LOC-02561",
        "Jean Loko",
        "Suzuki Dzire",
        "Courte durée",
        "16/06/2025",
        "Retourné",
      ],
    ],
  },
  Réservations: {
    headers: [
      "Réservation",
      "Client",
      "Départ",
      "Durée",
      "Commercial",
      "Statut",
    ],
    rows: [
      [
        "RES-20841",
        "Alex Morgan",
        "18/06/2025",
        "3 jours",
        "Aïcha Sossa",
        "Aboutie",
      ],
      [
        "RES-20839",
        "Sophie Adjovi",
        "18/06/2025",
        "6 jours",
        "Koffi Orou",
        "Confirmée",
      ],
      [
        "RES-20835",
        "Marc Houénou",
        "19/06/2025",
        "1 jour",
        "Mariam Bio",
        "En attente",
      ],
      [
        "RES-20828",
        "Sarah Johnson",
        "15/06/2025",
        "3 jours",
        "Aïcha Sossa",
        "Non aboutie",
      ],
    ],
  },
  Clients: {
    headers: ["Client", "Type", "Téléphone", "Locations", "Dernière opération"],
    rows: [
      [
        "Groupe Tèkponon",
        "Entreprise",
        "+229 01 97 12 43 08",
        "14",
        "12/06/2025",
      ],
      ["Sandra Adé", "Particulier", "+229 01 96 88 10 25", "5", "18/06/2025"],
      ["Cabinet A2C", "Entreprise", "+229 01 95 32 90 11", "11", "03/06/2025"],
      ["Jean Loko", "Particulier", "+229 01 97 41 22 16", "3", "16/06/2025"],
    ],
  },
}
