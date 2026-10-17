import type {
  Admin,
  AdminRecord,
  AdminRepo,
  Client,
  ClientFiche,
  ClientInput,
  ClientUpdateInput,
  ClientRepo,
  Commercial,
  CommercialFiche,
  CommercialInput,
  CommercialRepo,
  ListOptions,
  Location,
  LocationFiche,
  LocationInput,
  LocationRepo,
  Maintenance,
  MaintenanceRepo,
  MonthlyPoint,
  Mouvement,
  MouvementRepo,
  OverviewStats,
  Repositories,
  Reservation,
  ReservationInput,
  ReservationFiche,
  ReservationRepo,
  StatsRepo,
  Vehicule,
  VehiculeInput,
  VehiculeRepo,
} from "../types.js"
import {
  addDays,
  AvailabilityConflictError,
  matchesQuery,
  overlaps,
  performanceOf,
} from "../helpers.js"
import { buildSeedData, type SeedData } from "./seedData.js"

// Série mensuelle de référence (mêmes valeurs que le prototype).
// En production : à remplacer par un GROUP BY mensuel quand l'historique est alimenté.
const MONTHLY_REFERENCE: MonthlyPoint[] = [
  { mois: "Jan", courte: 45, longue: 26 },
  { mois: "Fév", courte: 52, longue: 31 },
  { mois: "Mar", courte: 65, longue: 38 },
  { mois: "Avr", courte: 58, longue: 42 },
  { mois: "Mai", courte: 78, longue: 48 },
  { mois: "Juin", courte: 88, longue: 56 },
]

const ACTIVE_LOCATION = ["En cours", "À retourner", "En retard"]

class MemoryAdminRepo implements AdminRepo {
  constructor(private data: SeedData) {}

  async findByEmail(email: string): Promise<AdminRecord | null> {
    return this.data.admin.email.toLowerCase() === email.trim().toLowerCase()
      ? this.data.admin
      : null
  }

  async findById(id: number): Promise<Admin | null> {
    if (this.data.admin.id !== id) return null
    const { passwordHash: _hash, ...safe } = this.data.admin
    return safe
  }
}

class MemoryVehiculeRepo implements VehiculeRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Vehicule[]> {
    const rows = this.data.vehicules.filter((v) =>
      matchesQuery(`${v.immatriculation} ${v.marqueModele} ${v.categorie} ${v.statut}`, options?.q),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<Vehicule | null> {
    return this.data.vehicules.find((v) => v.id === id) ?? null
  }

  async findByImmatriculation(immat: string): Promise<Vehicule | null> {
    const needle = immat.trim().toLowerCase()
    return this.data.vehicules.find((v) => v.immatriculation.toLowerCase() === needle) ?? null
  }

  async create(input: VehiculeInput, _adminId: number): Promise<Vehicule> {
    const id = Math.max(0, ...this.data.vehicules.map((v) => v.id)) + 1
    const row = { id, ...input }
    this.data.vehicules.push(row)
    return row
  }

  async update(id: number, input: Partial<VehiculeInput>): Promise<Vehicule | null> {
    const row = this.data.vehicules.find((v) => v.id === id)
    if (!row) return null
    Object.assign(row, input)
    return row
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.vehicules.findIndex((v) => v.id === id)
    if (index === -1) return false
    this.data.vehicules.splice(index, 1)
    return true
  }
}

class MemoryClientRepo implements ClientRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Client[]> {
    const rows = this.data.clients.filter((c) =>
      matchesQuery(`${c.nom} ${c.type} ${c.telephone}`, options?.q),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<Client | null> {
    return this.data.clients.find((c) => c.id === id) ?? null
  }

  async fiches(): Promise<ClientFiche[]> {
    return this.data.clients.map((c) => {
      const ops = this.data.locations
        .filter((l) => l.clientId === c.id)
        .map((l) => l.dateFin)
        .sort()
      return {
        ...c,
        locationsCount: ops.length,
        derniereOperation: ops.length > 0 ? ops[ops.length - 1]!.split("-").reverse().join("/") : null,
      }
    })
  }

  async create(input: ClientInput, _adminId: number): Promise<Client> {
    const id = Math.max(0, ...this.data.clients.map((client) => client.id)) + 1
    const row: Client = {
      id,
      nom: [input.prenom, input.nom].filter(Boolean).join(" "),
      nomFamille: input.nom,
      prenom: input.prenom || null,
      type: input.type,
      telephone: input.telephone,
      email: input.email || null,
      adresse: input.adresse || null,
      numPermis: input.numPermis || null,
    }
    this.data.clients.push(row)
    return row
  }

  async update(id: number, input: ClientUpdateInput): Promise<Client | null> {
    const row = this.data.clients.find((client) => client.id === id)
    if (!row) return null
    Object.assign(row, {
      nom: [input.prenom, input.nom].filter(Boolean).join(" "),
      nomFamille: input.nom,
      prenom: input.prenom || null,
      type: input.type,
      telephone: input.telephone,
      email: input.email || null,
      adresse: input.adresse || null,
      numPermis: input.numPermis || null,
    })
    return row
  }

  async remove(id: number): Promise<boolean> {
    const hasHistory =
      this.data.locations.some((location) => location.clientId === id) ||
      this.data.reservations.some((reservation) => reservation.clientId === id)
    if (hasHistory) return false
    const index = this.data.clients.findIndex((client) => client.id === id)
    if (index < 0) return false
    this.data.clients.splice(index, 1)
    return true
  }
}

class MemoryCommercialRepo implements CommercialRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Commercial[]> {
    const rows = this.data.commerciaux.filter(
      (c) => c.actif !== false && matchesQuery(`${c.nom} ${c.contact}`, options?.q),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<Commercial | null> {
    return this.data.commerciaux.find((c) => c.id === id && c.actif !== false) ?? null
  }

  async fiches(): Promise<CommercialFiche[]> {
    return this.data.commerciaux.filter((c) => c.actif !== false).map((c) => {
      const conclues = this.data.locations.filter((l) => l.commercialId === c.id)
      const chiffreAffaires = conclues.reduce((sum, l) => sum + l.montant, 0)
      return {
        ...c,
        locationsConclues: conclues.length,
        chiffreAffaires,
        performance: performanceOf(conclues.length),
      }
    })
  }

  async create(input: CommercialInput, _adminId: number): Promise<Commercial> {
    const id = Math.max(0, ...this.data.commerciaux.map((commercial) => commercial.id)) + 1
    const row: Commercial = {
      id,
      nom: [input.prenom, input.nom].filter(Boolean).join(" "),
      nomFamille: input.nom,
      prenom: input.prenom || null,
      abreviation: input.abreviation || null,
      telephone: input.telephone || null,
      email: input.email || null,
      contact: [input.telephone, input.email].filter(Boolean).join(" · "),
      actif: true,
    }
    this.data.commerciaux.push(row)
    return row
  }

  async update(id: number, input: CommercialInput): Promise<Commercial | null> {
    const row = this.data.commerciaux.find((commercial) => commercial.id === id)
    if (!row || row.actif === false) return null
    Object.assign(row, {
      nom: [input.prenom, input.nom].filter(Boolean).join(" "),
      nomFamille: input.nom,
      prenom: input.prenom || null,
      abreviation: input.abreviation || null,
      telephone: input.telephone || null,
      email: input.email || null,
      contact: [input.telephone, input.email].filter(Boolean).join(" · "),
    })
    return row
  }

  async deactivate(id: number): Promise<boolean> {
    const row = this.data.commerciaux.find((commercial) => commercial.id === id)
    if (!row || row.actif === false) return false
    row.actif = false
    return true
  }
}

function assertMemoryVehicleAvailable(
  data: SeedData,
  vehiculeId: number,
  debut: string,
  fin: string,
): void {
  const vehicle = data.vehicules.find((row) => row.id === vehiculeId)
  if (!vehicle) throw new Error("Véhicule introuvable")
  if (vehicle.statut === "Indisponible") {
    throw new AvailabilityConflictError("Véhicule indisponible pour la location")
  }
  const maintenance = data.maintenances.find(
    (row) =>
      row.vehiculeId === vehiculeId &&
      row.statut === "En cours" &&
      overlaps(row.dateEntree, row.dateSortie ?? "9999-12-31", debut, fin),
  )
  if (maintenance) {
    throw new AvailabilityConflictError(
      `Véhicule au garage sur la période${maintenance.motif ? ` (${maintenance.motif})` : ""}`,
    )
  }
  if (
    data.locations.some(
      (row) =>
        row.vehiculeId === vehiculeId &&
        ACTIVE_LOCATION.includes(row.statut) &&
        overlaps(row.dateDebut, row.statut === "En retard" ? "9999-12-31" : row.dateFin, debut, fin),
    )
  ) {
    throw new AvailabilityConflictError("Véhicule déjà loué sur la période")
  }
  if (
    data.reservations.some(
      (row) =>
        row.vehiculeId === vehiculeId &&
        ["En attente", "Confirmée"].includes(row.statut) &&
        overlaps(row.dateDepart, addDays(row.dateDepart, row.dureeJours), debut, fin),
    )
  ) {
    throw new AvailabilityConflictError("Véhicule déjà réservé sur la période")
  }
}

function toFiche(
  l: Location,
  clients: Client[],
  vehicules: Vehicule[],
): LocationFiche {
  return {
    ...l,
    client: clients.find((c) => c.id === l.clientId)?.nom ?? "?",
    vehicule: vehicules.find((v) => v.id === l.vehiculeId)?.marqueModele ?? "?",
  }
}

class MemoryLocationRepo implements LocationRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Location[]> {
    const rows = this.data.locations.filter((l) =>
      matchesQuery(`${l.reference} ${l.statut} ${l.type}`, options?.q),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async fiches(limit?: number): Promise<LocationFiche[]> {
    const rows = this.data.locations.map((l) => toFiche(l, this.data.clients, this.data.vehicules))
    return limit ? rows.slice(0, limit) : rows
  }

  async get(id: number): Promise<Location | null> {
    return this.data.locations.find((l) => l.id === id) ?? null
  }

  async forClient(clientId: number): Promise<LocationFiche[]> {
    return this.data.locations
      .filter((l) => l.clientId === clientId)
      .map((l) => toFiche(l, this.data.clients, this.data.vehicules))
  }

  async overlapping(vehiculeId: number, debut: string, fin: string): Promise<Location[]> {
    return this.data.locations.filter(
      (l) =>
        l.vehiculeId === vehiculeId &&
        ACTIVE_LOCATION.includes(l.statut) &&
        overlaps(l.dateDebut, l.dateFin, debut, fin),
    )
  }

  async create(input: LocationInput, _adminId: number): Promise<Location> {
    assertMemoryVehicleAvailable(this.data, input.vehiculeId, input.dateDebut, input.dateFin)
    const id = Math.max(0, ...this.data.locations.map((location) => location.id)) + 1
    const row: Location = {
      id,
      reference: `LOC-${String(id).padStart(5, "0")}`,
      clientId: input.clientId,
      vehiculeId: input.vehiculeId,
      commercialId: input.commercialId,
      type: input.type,
      dateDebut: input.dateDebut,
      dateFin: input.dateFin,
      montant: input.montant,
      statut: "En cours",
    }
    this.data.locations.push(row)
    return row
  }
}

class MemoryReservationRepo implements ReservationRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Reservation[]> {
    const rows = this.data.reservations.filter((r) =>
      matchesQuery(`${r.reference} ${r.statut}`, options?.q),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async fiches(): Promise<ReservationFiche[]> {
    return this.data.reservations.map((r) => ({
      ...r,
      client: this.data.clients.find((c) => c.id === r.clientId)?.nom ?? "?",
      commercial: r.commercialId
        ? (this.data.commerciaux.find((c) => c.id === r.commercialId)?.nom ?? null)
        : null,
    }))
  }

  async get(id: number): Promise<Reservation | null> {
    return this.data.reservations.find((r) => r.id === id) ?? null
  }

  async overlapping(vehiculeId: number, debut: string, fin: string): Promise<Reservation[]> {
    return this.data.reservations.filter((r) => {
      if (r.vehiculeId !== vehiculeId) return false
      if (!["En attente", "Confirmée"].includes(r.statut)) return false
      return overlaps(r.dateDepart, addDays(r.dateDepart, r.dureeJours), debut, fin)
    })
  }

  async create(input: ReservationInput): Promise<Reservation> {
    assertMemoryVehicleAvailable(this.data, input.vehiculeId, input.dateDepart, input.dateFin)
    const id = Math.max(0, ...this.data.reservations.map((reservation) => reservation.id)) + 1
    const debut = new Date(`${input.dateDepart}T00:00:00Z`)
    const fin = new Date(`${input.dateFin}T00:00:00Z`)
    const dureeJours = Math.max(1, Math.round((fin.getTime() - debut.getTime()) / 86400000))
    const row: Reservation = {
      id,
      reference: `RES-${String(id).padStart(5, "0")}`,
      clientId: input.clientId,
      vehiculeId: input.vehiculeId,
      commercialId: input.commercialId,
      dateDepart: input.dateDepart,
      dureeJours,
      statut: "En attente",
    }
    this.data.reservations.push(row)
    return row
  }
}

class MemoryMaintenanceRepo implements MaintenanceRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Maintenance[]> {
    const rows = this.data.maintenances.filter((m) =>
      matchesQuery(`${m.motif} ${m.statut}`, options?.q),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<Maintenance | null> {
    return this.data.maintenances.find((m) => m.id === id) ?? null
  }

  async openForVehicule(vehiculeId: number): Promise<Maintenance | null> {
    return (
      this.data.maintenances.find(
        (m) => m.vehiculeId === vehiculeId && m.statut === "En cours",
      ) ?? null
    )
  }

  async overlapping(vehiculeId: number, debut: string, fin: string): Promise<Maintenance[]> {
    return this.data.maintenances.filter(
      (maintenance) =>
        maintenance.vehiculeId === vehiculeId &&
        maintenance.statut === "En cours" &&
        overlaps(maintenance.dateEntree, maintenance.dateSortie ?? "9999-12-31", debut, fin),
    )
  }
}

class MemoryMouvementRepo implements MouvementRepo {
  constructor(private data: SeedData) {}

  async list(vehiculeId?: number): Promise<Mouvement[]> {
    const rows = vehiculeId
      ? this.data.mouvements.filter((m) => m.vehiculeId === vehiculeId)
      : this.data.mouvements
    return [...rows].sort((a, b) => (a.date < b.date ? 1 : -1))
  }
}

class MemoryStatsRepo implements StatsRepo {
  constructor(private data: SeedData) {}

  async overview(): Promise<OverviewStats> {
    const locations = this.data.locations.filter((l) => l.statut !== "Annulé")
    const caTotal = locations.reduce((sum, l) => sum + l.montant, 0)
    const vehiculesDisponibles = this.data.vehicules.filter(
      (v) => v.statut === "Disponible",
    ).length
    const locationsActives = this.data.locations.filter((l) =>
      ACTIVE_LOCATION.includes(l.statut),
    ).length
    const abouties = this.data.reservations.filter((r) => r.statut === "Aboutie").length
    const round1 = (n: number): number => Math.round(n * 10) / 10
    return {
      caTotal,
      devise: "FCFA",
      caCroissance: "+12,6%",
      vehiculesDisponibles,
      vehiculesTotal: this.data.vehicules.length,
      locationsActives,
      reservationsEnAttente: this.data.reservations.filter((r) => r.statut === "En attente")
        .length,
      // Définitions : utilisation = actives / parc ; rotation = locations / véhicule.
      tauxUtilisation:
        this.data.vehicules.length > 0
          ? round1((locationsActives / this.data.vehicules.length) * 100)
          : 0,
      tauxRotation:
        this.data.vehicules.length > 0
          ? round1(locations.length / this.data.vehicules.length)
          : 0,
      reservationsAbouties: abouties,
      reservationsTotal: this.data.reservations.length,
    }
  }

  async monthly(): Promise<MonthlyPoint[]> {
    return MONTHLY_REFERENCE
  }
}

export async function memoryRepositories(): Promise<Repositories> {
  const data = await buildSeedData()
  return {
    admins: new MemoryAdminRepo(data),
    vehicules: new MemoryVehiculeRepo(data),
    clients: new MemoryClientRepo(data),
    commerciaux: new MemoryCommercialRepo(data),
    locations: new MemoryLocationRepo(data),
    reservations: new MemoryReservationRepo(data),
    maintenances: new MemoryMaintenanceRepo(data),
    mouvements: new MemoryMouvementRepo(data),
    stats: new MemoryStatsRepo(data),
  }
}
