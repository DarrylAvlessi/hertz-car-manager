import type {
  Admin,
  AdminRecord,
  AdminRepo,
  CategorieVehicule,
  CategorieVehiculeInput,
  CategorieVehiculeRepo,
  Centre,
  CentreRepo,
  Garage,
  GarageInput,
  GarageRepo,
  PassageGarage,
  PassageGarageInput,
  PassageGarageRepo,
  Reparation,
  ReparationInput,
  ReparationRepo,
  Client,
  ClientFiche,
  ClientRepo,
  Commercial,
  CommercialFiche,
  CommercialRepo,
  ListOptions,
  Location,
  LocationFiche,
  LocationRepo,
  LocationInput,
  Prolongation,
  ProlongationInput,
  ProlongationRepo,
  ModeleVehicule,
  ModeleVehiculeInput,
  ModeleVehiculeRepo,
  Maintenance,
  MaintenanceRepo,
  MonthlyPoint,
  Mouvement,
  MouvementRepo,
  OverviewStats,
  Repositories,
  Reservation,
  ReservationFiche,
  ReservationRepo,
  StatsRepo,
  Vehicule,
  VehiculeInput,
  VehiculeRepo,
  VehiculeStatut,
  VenteVehicule,
  VenteVehiculeInput,
  VenteVehiculeRepo,
} from "../types.js"
import { addDays, matchesQuery, overlaps, performanceOf } from "../helpers.js"
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

const ACTIVE_LOCATION = ["EN_COURS", "EN_RETARD", "EN_PROLONGATION"]

function localDateTimeNow(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 19).replace("T", " ")
}

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
      matchesQuery(
        `${v.immatriculation} ${v.marqueModele ?? `${v.marque ?? ""} ${v.modele ?? ""}`} ${v.categorie ?? ""} ${v.statut}`,
        options?.q,
      ),
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
    const row: Vehicule = {
      id,
      ...input,
      statut: "ENTREE_PARC",
      marqueModele: `${input.marque} ${input.modele}`,
      categorie: input.categorieId === null || input.categorieId === undefined ? null : String(input.categorieId),
    }
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

class MemoryCategorieRepo implements CategorieVehiculeRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<CategorieVehicule[]> {
    const rows = this.data.categories.filter((c) => matchesQuery(c.libelle, options?.q))
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<CategorieVehicule | null> {
    return this.data.categories.find((c) => c.id === id) ?? null
  }

  async create(input: CategorieVehiculeInput): Promise<CategorieVehicule> {
    const row = { id: Math.max(0, ...this.data.categories.map((c) => c.id)) + 1, ...input }
    this.data.categories.push(row)
    return row
  }

  async update(id: number, input: Partial<CategorieVehiculeInput>): Promise<CategorieVehicule | null> {
    const row = await this.get(id)
    if (!row) return null
    Object.assign(row, input)
    return row
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.categories.findIndex((c) => c.id === id)
    if (index === -1) return false
    this.data.categories.splice(index, 1)
    return true
  }
}

class MemoryGarageRepo implements GarageRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Garage[]> {
    return this.data.garages.filter((garage) =>
      matchesQuery(`${garage.nom} ${garage.adresse ?? ""} ${garage.telephone ?? ""}`, options?.q),
    )
  }

  async get(id: number): Promise<Garage | null> {
    return this.data.garages.find((garage) => garage.id === id) ?? null
  }

  async create(input: GarageInput): Promise<Garage> {
    const garage = { id: Math.max(0, ...this.data.garages.map((item) => item.id)) + 1, adresse: null, telephone: null, ...input }
    this.data.garages.push(garage)
    return garage
  }

  async update(id: number, input: Partial<GarageInput>): Promise<Garage | null> {
    const garage = await this.get(id)
    if (!garage) return null
    Object.assign(garage, input)
    return garage
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.garages.findIndex((garage) => garage.id === id)
    if (index < 0) return false
    this.data.garages.splice(index, 1)
    return true
  }
}

class MemoryPassageGarageRepo implements PassageGarageRepo {
  constructor(private data: SeedData) {}

  private hydrate(row: PassageGarage): PassageGarage {
    return {
      ...row,
      vehicule: this.data.vehicules.find((item) => item.id === row.vehiculeId)?.immatriculation ?? row.vehicule ?? null,
      garage: this.data.garages.find((item) => item.id === row.garageId)?.nom ?? row.garage ?? null,
    }
  }

  async list(options?: ListOptions): Promise<PassageGarage[]> {
    const rows = this.data.passagesGarage
      .map((row) => this.hydrate(row))
      .filter((row) => matchesQuery(`${row.vehicule ?? ""} ${row.garage ?? ""} ${row.typePassage} ${row.statut} ${row.motif ?? ""}`, options?.q))
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<PassageGarage | null> {
    const row = this.data.passagesGarage.find((item) => item.id === id)
    return row ? this.hydrate(row) : null
  }

  async update(id: number, input: Partial<PassageGarageInput>): Promise<PassageGarage | null> {
    const row = this.data.passagesGarage.find((item) => item.id === id)
    if (!row) return null
    const wasCompleted = row.statut === "TERMINEE"
    Object.assign(row, input)
    if (input.statut === "TERMINEE") {
      const date = new Date()
      row.dateSortieReelle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      if (!wasCompleted) {
        const vehicle = this.data.vehicules.find((item) => item.id === row.vehiculeId)
        if (vehicle) {
          vehicle.statut = "RETOUR_GARAGE"
          this.data.mouvements.push({
            id: Math.max(0, ...this.data.mouvements.map((item) => item.id)) + 1,
            vehiculeId: row.vehiculeId,
            type: "RETOUR_GARAGE",
            motif: row.motif,
            kilometrage: vehicle.kilometrage,
            date: row.dateSortieReelle,
            commentaire: "Retour du garage",
          })
          this.data.reparations.push({
            id: Math.max(0, ...this.data.reparations.map((item) => item.id)) + 1,
            description: row.motif ?? "Réparation effectuée au garage",
            dateReparation: new Date().toISOString(),
            cout: row.coutTotal,
            passageId: row.id,
            vehicule: vehicle.immatriculation,
          })
        }
      }
    }
    return this.hydrate(row)
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.passagesGarage.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.data.passagesGarage.splice(index, 1)
    return true
  }
}

class MemoryReparationRepo implements ReparationRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Reparation[]> {
    for (const passage of this.data.passagesGarage.filter((item) => item.statut === "TERMINEE")) {
      if (this.data.reparations.some((item) => item.passageId === passage.id)) continue
      const vehicle = this.data.vehicules.find((item) => item.id === passage.vehiculeId)
      this.data.reparations.push({
        id: Math.max(0, ...this.data.reparations.map((item) => item.id)) + 1,
        description: passage.motif ?? "Réparation effectuée au garage",
        dateReparation: passage.dateSortieReelle ?? new Date().toISOString(),
        cout: passage.coutTotal,
        passageId: passage.id,
        vehicule: vehicle?.immatriculation ?? null,
      })
    }
    const rows = this.data.reparations.filter((item) =>
      matchesQuery(`${item.description} ${item.vehicule ?? ""}`, options?.q),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<Reparation | null> {
    return this.data.reparations.find((item) => item.id === id) ?? null
  }

  async update(id: number, input: Partial<ReparationInput>): Promise<Reparation | null> {
    const row = await this.get(id)
    if (!row) return null
    Object.assign(row, input)
    return row
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.reparations.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.data.reparations.splice(index, 1)
    return true
  }
}

class MemoryModeleRepo implements ModeleVehiculeRepo {
  constructor(private data: SeedData) {}

  private withCategory(row: ModeleVehicule): ModeleVehicule {
    return {
      ...row,
      categorie: this.data.categories.find((c) => c.id === row.categorieId)?.libelle ?? null,
    }

  }

  async list(options?: ListOptions): Promise<ModeleVehicule[]> {
    const rows = this.data.modeles
      .map((m) => this.withCategory(m))
      .filter((m) => matchesQuery(`${m.marque} ${m.nom} ${m.categorie ?? ""}`, options?.q))
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<ModeleVehicule | null> {
    const row = this.data.modeles.find((m) => m.id === id)
    return row ? this.withCategory(row) : null
  }

  async create(input: ModeleVehiculeInput): Promise<ModeleVehicule> {
    const row = {
      id: Math.max(0, ...this.data.modeles.map((m) => m.id)) + 1,
      ...input,
      categorie: null,
    }
    this.data.modeles.push(row)
    return this.withCategory(row)
  }

  async update(id: number, input: Partial<ModeleVehiculeInput>): Promise<ModeleVehicule | null> {
    const row = this.data.modeles.find((m) => m.id === id)
    if (!row) return null
    Object.assign(row, input)
    return this.withCategory(row)
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.modeles.findIndex((m) => m.id === id)
    if (index === -1) return false
    this.data.modeles.splice(index, 1)
    return true
  }
}

class MemoryCentreRepo implements CentreRepo {
  constructor(private data: SeedData) {}
  async list(): Promise<Centre[]> {
    return this.data.centres
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
}

class MemoryCommercialRepo implements CommercialRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Commercial[]> {
    const rows = this.data.commerciaux.filter((c) =>
      matchesQuery(`${c.nom} ${c.contact}`, options?.q),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<Commercial | null> {
    return this.data.commerciaux.find((c) => c.id === id) ?? null
  }

  async fiches(): Promise<CommercialFiche[]> {
    return this.data.commerciaux.map((c) => {
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
}

function toFiche(
  l: Location,
  clients: Client[],
  vehicules: Vehicule[],
): LocationFiche {
  return {
    ...l,
    client: clients.find((c) => c.id === l.clientId)?.nom ?? "?",
    vehicule:
      vehicules.find((v) => v.id === l.vehiculeId)?.marqueModele ??
      `${vehicules.find((v) => v.id === l.vehiculeId)?.marque ?? ""} ${vehicules.find((v) => v.id === l.vehiculeId)?.modele ?? ""}`.trim() ??
      "?",
  }
}

class MemoryLocationRepo implements LocationRepo {
  constructor(private data: SeedData) {}

  async refreshStatuses(): Promise<void> {
    const now = Date.now()
    for (const prolongation of this.data.prolongations) {
      const end = Date.parse(prolongation.nouvelleDateFin.replace(" ", "T"))
      if (prolongation.statut === "EN_COURS" && Number.isFinite(end) && end < now) {
        prolongation.statut = "EXPIRE"
      }
    }
    for (const location of this.data.locations) {
      const end = Date.parse(location.dateFin.replace(" ", "T"))
      const hasActiveProlongation = this.data.prolongations.some(
        (item) => item.locationId === location.id && item.statut === "EN_COURS",
      )
      if (
        Number.isFinite(end) && end < now &&
        (location.statut === "EN_COURS" || (location.statut === "EN_PROLONGATION" && !hasActiveProlongation))
      ) {
        location.statut = "EN_RETARD"
      }
    }
  }

  async list(options?: ListOptions): Promise<Location[]> {
    await this.refreshStatuses()
    const rows = this.data.locations.filter((l) =>
      matchesQuery(`${l.reference} ${l.statut} ${l.type}`, options?.q),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async fiches(limit?: number): Promise<LocationFiche[]> {
    await this.refreshStatuses()
    const rows = this.data.locations.map((l) => toFiche(l, this.data.clients, this.data.vehicules))
    return limit ? rows.slice(0, limit) : rows
  }

  async get(id: number): Promise<Location | null> {
    await this.refreshStatuses()
    return this.data.locations.find((l) => l.id === id) ?? null
  }

  async create(input: LocationInput): Promise<Location> {
    const location: Location = {
      id: Math.max(0, ...this.data.locations.map((item) => item.id)) + 1,
      reference: input.reference?.trim() || `LOC-${String(Date.now()).slice(-5)}`,
      clientId: input.clientId,
      vehiculeId: input.vehiculeId,
      commercialId: input.commercialId ?? null,
      type: input.type,
      dateDebut: input.dateDebut,
      dateFin: input.dateFin,
      dateRetourReelle: input.statut === "TERMINEE" ? localDateTimeNow() : null,
      montant: input.montant ?? 0,
      statut: input.statut ?? "EN_COURS",
    }
    const end = Date.parse(location.dateFin.replace(" ", "T"))
    if (location.statut === "EN_COURS" && Number.isFinite(end) && end < Date.now()) {
      location.statut = "EN_RETARD"
    }
    this.data.locations.push(location)
    const movementType = location.statut === "TERMINEE" ? "RETOUR_LOCATION" : "MISE_EN_LOCATION"
    const vehicle = this.data.vehicules.find((item) => item.id === location.vehiculeId)
    if (vehicle) vehicle.statut = movementType
    this.data.mouvements.push({
      id: Math.max(0, ...this.data.mouvements.map((item) => item.id)) + 1,
      vehiculeId: location.vehiculeId,
      locationId: location.id,
      type: movementType,
      motif: "LOCATION",
      kilometrage: vehicle?.kilometrage ?? null,
      date: new Date().toISOString().slice(0, 10),
      commentaire: location.reference,
    })
    return location
  }

  async update(id: number, input: Partial<LocationInput>): Promise<Location | null> {
    await this.refreshStatuses()
    const location = this.data.locations.find((item) => item.id === id)
    if (!location) return null
    const wasCompleted = location.statut === "TERMINEE"
    Object.assign(location, {
      ...input,
      reference: input.reference?.trim() || location.reference,
    })
    const end = Date.parse(location.dateFin.replace(" ", "T"))
    if (location.statut === "EN_COURS" && Number.isFinite(end) && end < Date.now()) {
      location.statut = "EN_RETARD"
    }
    if (location.statut === "TERMINEE") {
      if (!wasCompleted) location.dateRetourReelle = localDateTimeNow()
      const vehicle = this.data.vehicules.find((item) => item.id === location.vehiculeId)
      if (vehicle) vehicle.statut = "RETOUR_LOCATION"
      if (!wasCompleted) {
        this.data.mouvements.push({
          id: Math.max(0, ...this.data.mouvements.map((item) => item.id)) + 1,
          vehiculeId: location.vehiculeId,
          locationId: location.id,
          type: "RETOUR_LOCATION",
          motif: "LOCATION",
          kilometrage: vehicle?.kilometrage ?? null,
          date: new Date().toISOString().slice(0, 10),
          commentaire: location.reference,
        })
      }
    } else {
      location.dateRetourReelle = null
      if (wasCompleted) {
        const vehicle = this.data.vehicules.find((item) => item.id === location.vehiculeId)
        if (vehicle) vehicle.statut = "MISE_EN_LOCATION"
        this.data.mouvements.push({
          id: Math.max(0, ...this.data.mouvements.map((item) => item.id)) + 1,
          vehiculeId: location.vehiculeId,
          locationId: location.id,
          type: "MISE_EN_LOCATION",
          motif: "LOCATION",
          kilometrage: vehicle?.kilometrage ?? null,
          date: new Date().toISOString().slice(0, 10),
          commentaire: location.reference,
        })
      }
    }
    if (input.prolongation) {
      await new MemoryProlongationRepo(this.data).create({
        ...input.prolongation,
        locationId: id,
      })
      location.dateFin = input.prolongation.nouvelleDateFin
      location.montant += input.prolongation.montantSupplementaire
      location.statut = "EN_PROLONGATION"
    }
    return location
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.locations.findIndex((item) => item.id === id)
    if (index < 0) return false
    const [location] = this.data.locations.splice(index, 1)
    if (!location) return false
    if (location.statut !== "TERMINEE") {
      this.data.mouvements.push({
        id: Math.max(0, ...this.data.mouvements.map((item) => item.id)) + 1,
        vehiculeId: location.vehiculeId,
        locationId: null,
        type: "RETOUR_LOCATION",
        motif: "LOCATION",
        kilometrage: this.data.vehicules.find((item) => item.id === location.vehiculeId)?.kilometrage ?? null,
        date: new Date().toISOString().slice(0, 10),
        commentaire: `Clôture de ${location.reference}`,
      })
    }
    for (const movement of this.data.mouvements) {
      if (movement.locationId === id) movement.locationId = null
    }
    const vehicle = this.data.vehicules.find((item) => item.id === location.vehiculeId)
    const latest = this.data.mouvements
      .filter((item) => item.vehiculeId === location.vehiculeId)
      .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))[0]
    if (vehicle) vehicle.statut = latest?.type ?? "ENTREE_PARC"
    return true
  }

  async forClient(clientId: number): Promise<LocationFiche[]> {
    await this.refreshStatuses()
    return this.data.locations
      .filter((l) => l.clientId === clientId)
      .map((l) => toFiche(l, this.data.clients, this.data.vehicules))
  }

  async overlapping(vehiculeId: number, debut: string, fin: string): Promise<Location[]> {
    await this.refreshStatuses()
    return this.data.locations.filter(
      (l) =>
        l.vehiculeId === vehiculeId &&
        ACTIVE_LOCATION.includes(l.statut) &&
        overlaps(l.dateDebut, l.dateFin, debut, fin),
    )
  }
}

class MemoryProlongationRepo implements ProlongationRepo {
  constructor(private data: SeedData) {}

  async list(): Promise<Prolongation[]> {
    await new MemoryLocationRepo(this.data).refreshStatuses()
    return [...this.data.prolongations]
  }
  async get(id: number): Promise<Prolongation | null> {
    await new MemoryLocationRepo(this.data).refreshStatuses()
    return this.data.prolongations.find((item) => item.id === id) ?? null
  }
  async create(input: ProlongationInput): Promise<Prolongation> {
    const row: Prolongation = {
      id: Math.max(0, ...this.data.prolongations.map((item) => item.id)) + 1,
      ...input,
      ancienneDateFin: input.ancienneDateFin ?? null,
      statut: "EN_COURS",
      motif: input.motif ?? null,
      commercialId: input.commercialId ?? null,
    }
    this.data.prolongations.push(row)
    await new MemoryLocationRepo(this.data).refreshStatuses()
    return row
  }
  async update(id: number, input: Partial<ProlongationInput>): Promise<Prolongation | null> {
    const row = this.data.prolongations.find((item) => item.id === id)
    if (!row) return null
    Object.assign(row, input)
    await new MemoryLocationRepo(this.data).refreshStatuses()
    return row
  }
  async remove(id: number): Promise<boolean> {
    const index = this.data.prolongations.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.data.prolongations.splice(index, 1)
    return true
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
}

class MemoryMouvementRepo implements MouvementRepo {
  constructor(private data: SeedData) {}

  async list(vehiculeId?: number): Promise<Mouvement[]> {
    const rows = vehiculeId
      ? this.data.mouvements.filter((m) => m.vehiculeId === vehiculeId)
      : this.data.mouvements
    return [...rows].sort((a, b) => (a.date < b.date ? 1 : -1))
  }

  async createEntry(input: { vehiculeId: number; date: string; kilometrage: number; observation?: string | null }): Promise<void> {
    const id = Math.max(0, ...this.data.mouvements.map((m) => m.id)) + 1
    this.data.mouvements.push({
      id,
      vehiculeId: input.vehiculeId,
      type: "ENTREE_PARC",
      motif: null,
      kilometrage: input.kilometrage,
      date: input.date,
      commentaire: input.observation ?? "Entrée au parc",
    })
    const vehicle = this.data.vehicules.find((v) => v.id === input.vehiculeId)
    if (vehicle) vehicle.statut = "ENTREE_PARC"
  }

  async changeVehicleStatus(input: {
    vehiculeId: number
    statut: VehiculeStatut
    kilometrage: number
    observation?: string | null
    garageId?: number
    typePassage?: PassageGarage["typePassage"]
    motif?: string | null
    typeLocation?: Location["type"]
    clientId?: number
    commercialId?: number
    dateDebut?: string
    dateFin?: string
  }): Promise<Mouvement> {
    const vehicle = this.data.vehicules.find((v) => v.id === input.vehiculeId)
    if (!vehicle) throw new Error("Véhicule introuvable")
    const movement: Mouvement = {
      id: Math.max(0, ...this.data.mouvements.map((m) => m.id)) + 1,
      vehiculeId: input.vehiculeId,
      locationId: null,
      type: input.statut,
      motif: null,
      kilometrage: input.kilometrage,
      date: new Date().toISOString().slice(0, 10),
      commentaire: input.observation ?? null,
    }
    vehicle.statut = input.statut
    vehicle.kilometrage = Math.max(vehicle.kilometrage, input.kilometrage)
    this.data.mouvements.push(movement)
    if (input.statut === "MISE_EN_LOCATION") {
      const client = this.data.clients.find((item) => item.id === input.clientId) ?? this.data.clients[0]
      if (!client) throw new Error("Aucun client disponible pour créer la location")
      const location: Location = {
        id: Math.max(0, ...this.data.locations.map((item) => item.id)) + 1,
        reference: `LOC-${String(Date.now()).slice(-5)}`,
        clientId: client.id,
        vehiculeId: input.vehiculeId,
        commercialId: input.commercialId ?? this.data.commerciaux[0]?.id ?? null,
        type: input.typeLocation ?? "Courte durée",
        dateDebut: input.dateDebut ?? movement.date,
        dateFin: input.dateFin ?? addDays(movement.date, input.typeLocation === "Longue durée" ? 30 : 1),
        montant: 0,
        dateRetourReelle: null,
        statut: "EN_COURS",
      }
      this.data.locations.push(location)
      movement.locationId = location.id
    } else if (input.statut === "RETOUR_LOCATION") {
      const location = this.data.locations
        .filter((item) => item.vehiculeId === input.vehiculeId && ACTIVE_LOCATION.includes(item.statut))
        .sort((a, b) => (a.dateFin < b.dateFin ? 1 : -1))[0]
      if (location) {
        location.statut = "TERMINEE"
        location.dateRetourReelle = localDateTimeNow()
        movement.locationId = location.id
      }
    }
    if (input.statut === "ENVOI_GARAGE") {
      const garage = this.data.garages.find((item) => item.id === input.garageId) ?? this.data.garages[0]
      if (!garage) throw new Error("Aucun garage disponible pour enregistrer le passage")
      this.data.passagesGarage.push({
        id: Math.max(0, ...this.data.passagesGarage.map((item) => item.id)) + 1,
        typePassage: input.typePassage ?? "REPARATION",
        dateEntree: movement.date,
        dateSortiePrevue: null,
        dateSortieReelle: null,
        kmEntree: input.kilometrage ?? null,
        motif: input.motif ?? input.observation ?? null,
        statut: "EN_COURS",
        coutTotal: 0,
        vehiculeId: input.vehiculeId,
        garageId: garage.id,
        vehicule: null,
        garage: null,
        vehiculeRemplacementId: null,
      })
    }
    return movement
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.mouvements.findIndex((item) => item.id === id)
    if (index < 0) return false
    const [removed] = this.data.mouvements.splice(index, 1)
    const location = removed?.locationId ? this.data.locations.find((item) => item.id === removed.locationId) : null
    if (location && removed?.type === "RETOUR_LOCATION") {
      location.statut = "EN_COURS"
      location.dateRetourReelle = null
    }
    const vehicle = this.data.vehicules.find((item) => item.id === removed!.vehiculeId)
    const latest = this.data.mouvements
      .filter((item) => item.vehiculeId === removed!.vehiculeId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    if (vehicle) vehicle.statut = latest?.type ?? "ENTREE_PARC"
    return true
  }
}

class MemoryVenteVehiculeRepo implements VenteVehiculeRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<VenteVehicule[]> {
    const rows = this.data.ventesVehicules.filter((sale) =>
      matchesQuery(`${sale.numeroVente} ${sale.vehiculeId} ${sale.acheteurId} ${sale.statut}`, options?.q),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<VenteVehicule | null> {
    return this.data.ventesVehicules.find((sale) => sale.id === id) ?? null
  }

  async isMovementLinked(movementId: number): Promise<boolean> {
    return this.data.ventesVehicules.some((sale) => sale.mouvementId === movementId) ||
      this.data.mouvements.some((movement) => movement.id === movementId && movement.locationId != null)
  }

  async create(input: VenteVehiculeInput, adminId: number): Promise<VenteVehicule> {
    const vehicle = this.data.vehicules.find((item) => item.id === input.vehiculeId)
    if (!vehicle) throw new Error("Véhicule introuvable")
    if (this.data.ventesVehicules.some((sale) => sale.vehiculeId === input.vehiculeId && sale.statut === "CONCLUE")) {
      throw new Error("Ce véhicule possède déjà une vente conclue")
    }
    const movement: Mouvement = {
      id: Math.max(0, ...this.data.mouvements.map((item) => item.id)) + 1,
      vehiculeId: input.vehiculeId,
      locationId: null,
      type: "SORTIE_DEFINITIVE",
      motif: null,
      kilometrage: input.kilometrageVente,
      date: `${input.dateVente}T00:00:00`,
      commentaire: `Vente ${input.numeroVente}`,
    }
    this.data.mouvements.push(movement)
    const sale: VenteVehicule = {
      id: Math.max(0, ...this.data.ventesVehicules.map((item) => item.id)) + 1,
      ...input,
      devise: input.devise ?? "XOF",
      fraisVente: input.fraisVente ?? 0,
      canalVente: input.canalVente ?? null,
      statutPaiement: input.statutPaiement ?? "NON_PAYEE",
      dateRemiseVehicule: input.dateRemiseVehicule ?? null,
      referenceCession: input.referenceCession ?? null,
      statut: "CONCLUE",
      dateAnnulation: null,
      motifAnnulation: null,
      factureId: input.factureId ?? null,
      mouvementId: movement.id,
      commercialId: input.commercialId ?? null,
      administrateurId: adminId,
      observation: input.observation ?? null,
      dateCreation: new Date().toISOString(),
    }
    this.data.ventesVehicules.push(sale)
    vehicle.statut = "SORTIE_DEFINITIVE"
    vehicle.kilometrage = Math.max(vehicle.kilometrage, input.kilometrageVente)
    vehicle.prixVente = input.prixVente
    vehicle.dateSortieParc = input.dateVente
    return sale
  }
}

class MemoryStatsRepo implements StatsRepo {
  constructor(private data: SeedData) {}

  async overview(): Promise<OverviewStats> {
    const locations = this.data.locations
    const caTotal = locations.reduce((sum, l) => sum + l.montant, 0)
    const vehiculesDisponibles = this.data.vehicules.filter(
      (v) => v.statut === "ENTREE_PARC" || v.statut === "RETOUR_LOCATION" ||
        v.statut === "RETOUR_INTERNE" || v.statut === "RETOUR_GARAGE",
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
    categories: new MemoryCategorieRepo(data),
    modeles: new MemoryModeleRepo(data),
    centres: new MemoryCentreRepo(data),
    garages: new MemoryGarageRepo(data),
    passagesGarage: new MemoryPassageGarageRepo(data),
    reparations: new MemoryReparationRepo(data),
    vehicules: new MemoryVehiculeRepo(data),
    clients: new MemoryClientRepo(data),
    commerciaux: new MemoryCommercialRepo(data),
    locations: new MemoryLocationRepo(data),
    prolongations: new MemoryProlongationRepo(data),
    reservations: new MemoryReservationRepo(data),
    maintenances: new MemoryMaintenanceRepo(data),
    mouvements: new MemoryMouvementRepo(data),
    ventesVehicules: new MemoryVenteVehiculeRepo(data),
    stats: new MemoryStatsRepo(data),
  }
}
