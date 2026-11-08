import type {
  Admin,
  AdminRecord,
  AdminRepo,
  Agence,
  AgenceInput,
  AgenceRepo,
  CategorieVehicule,
  CategorieVehiculeInput,
  CategorieVehiculeRepo,
  Centre,
  CentreInput,
  CentreRepo,
  Conducteur,
  ConducteurInput,
  ConducteurRepo,
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
  ClientInput,
  ClientUpdateInput,
  ClientRepo,
  Commercial,
  CommercialFiche,
  CommercialInput,
  CommercialRepo,
  Contravention,
  ContraventionInput,
  ContraventionRepo,
  ListOptions,
  Location,
  LocationFiche,
  LocationInput,
  LocationRepo,
  Prolongation,
  ProlongationInput,
  ProlongationRepo,
  ModeleVehicule,
  ModeleVehiculeInput,
  ModeleVehiculeRepo,
  Maintenance,
  MaintenanceRepo,
  DailyStat,
  FleetStatus,
  MonthlyPoint,
  Mouvement,
  MouvementRepo,
  OverviewStats,
  SinistreImmobilisation,
  StatsPeriod,
  Repositories,
  Reservation,
  ReservationHistoryEntry,
  ReservationLostAffairExportRow,
  ReservationImportInput,
  ReservationInput,
  ReservationUpdateInput,
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

import {
  addDays,
  AvailabilityConflictError,
  ReservationInUseError,
  matchesQuery,
  overlaps,
  performanceOf,
  ReservationStatusConflictError,
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

class MemoryAgenceRepo implements AgenceRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Agence[]> {
    const rows = this.data.agences

      .filter((agency) =>
        matchesQuery(
          `${agency.code} ${agency.nom} ${agency.adresse ?? ""} ${agency.telephone ?? ""}`,

          options?.q,
        ),
      )

      .sort((left, right) => left.nom.localeCompare(right.nom, "fr"))

    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<Agence | null> {
    return this.data.agences.find((agency) => agency.id === id) ?? null
  }

  async create(input: AgenceInput): Promise<Agence> {
    const agency: Agence = {
      id: Math.max(0, ...this.data.agences.map((row) => row.id)) + 1,

      ...input,
    }

    this.data.agences.push(agency)

    return agency
  }

  async update(
    id: number,
    input: Partial<AgenceInput>,
  ): Promise<Agence | null> {
    const agency = this.data.agences.find((row) => row.id === id)

    if (!agency) return null

    Object.assign(agency, input)

    return agency
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.agences.findIndex((agency) => agency.id === id)

    if (index < 0) return false

    this.data.agences.splice(index, 1)

    return true
  }
}

class MemoryConducteurRepo implements ConducteurRepo {
  constructor(private data: SeedData) {}

  async list(options?: ListOptions): Promise<Conducteur[]> {
    const rows = this.data.conducteurs
      .filter((driver) =>
        matchesQuery(
          `${driver.nom} ${driver.prenom ?? ""} ${driver.telephone ?? ""} ${driver.numPermis ?? ""} ${driver.categorie} ${driver.client ?? ""}`,
          options?.q,
        ),
      )
      .sort((left, right) =>
        `${left.nom} ${left.prenom ?? ""}`.localeCompare(
          `${right.nom} ${right.prenom ?? ""}`,
          "fr",
        ),
      )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<Conducteur | null> {
    return this.data.conducteurs.find((driver) => driver.id === id) ?? null
  }

  async create(input: ConducteurInput): Promise<Conducteur> {
    const driver: Conducteur = {
      id: Math.max(0, ...this.data.conducteurs.map((row) => row.id)) + 1,
      nom: input.nom,
      prenom: input.prenom ?? null,
      telephone: input.telephone ?? null,
      numPermis: input.numPermis ?? null,
      categorie: input.categorie,
      clientId: input.clientId ?? null,
      client: input.clientId
        ? (this.data.clients.find((client) => client.id === input.clientId)
            ?.nom ?? null)
        : null,
    }
    this.data.conducteurs.push(driver)
    return driver
  }

  async update(
    id: number,
    input: Partial<ConducteurInput>,
  ): Promise<Conducteur | null> {
    const driver = await this.get(id)
    if (!driver) return null
    Object.assign(driver, input)
    if (input.clientId !== undefined) {
      driver.clientId = input.clientId ?? null
      driver.client = driver.clientId
        ? (this.data.clients.find((client) => client.id === driver.clientId)
            ?.nom ?? null)
        : null
    }
    return driver
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.conducteurs.findIndex((driver) => driver.id === id)
    if (index < 0) return false
    this.data.conducteurs.splice(index, 1)
    return true
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

    return (
      this.data.vehicules.find(
        (v) => v.immatriculation.toLowerCase() === needle,
      ) ?? null
    )
  }

  async create(input: VehiculeInput, _adminId: number): Promise<Vehicule> {
    const id = Math.max(0, ...this.data.vehicules.map((v) => v.id)) + 1

    const row: Vehicule = {
      id,

      ...input,

      statut: "ENTREE_PARC",

      marqueModele: `${input.marque} ${input.modele}`,

      categorie:
        input.categorieId === null || input.categorieId === undefined
          ? null
          : String(input.categorieId),
    }

    this.data.vehicules.push(row)

    return row
  }

  async importMany(inputs: VehiculeInput[], _adminId: number): Promise<{
    created: number
    updated: number
  }> {
    const normalize = (value: string) =>
      value.trim().replace(/[\s-]/g, "").toUpperCase()

    const targets = inputs.map((input) =>
      this.data.vehicules.find(
        (vehicle) =>
          normalize(vehicle.immatriculation) ===
          normalize(input.immatriculation),
      ),
    )

    for (let index = 0; index < inputs.length; index += 1) {
      const vin = inputs[index]!.numeroChassis

      if (!vin) continue

      if (
        this.data.vehicules.some(
          (vehicle) =>
            vehicle.numeroChassis === vin && vehicle.id !== targets[index]?.id,
        )
      ) {
        throw new Error(
          `Le numéro de châssis ${vin} est déjà associé à un autre véhicule.`,
        )
      }
    }

    let created = 0

    let updated = 0

    inputs.forEach((input, index) => {
      const existing = targets[index]

      if (existing) {
        Object.assign(existing, input, {
          marqueModele: `${input.marque} ${input.modele}`,
        })

        updated += 1
      } else {
        const id =
          Math.max(0, ...this.data.vehicules.map((vehicle) => vehicle.id)) + 1

        this.data.vehicules.push({
          id,

          ...input,

          statut: "ENTREE_PARC",

          marqueModele: `${input.marque} ${input.modele}`,
        })

        created += 1
      }
    })

    return { created, updated }
  }

  async update(
    id: number,
    input: Partial<VehiculeInput>,
  ): Promise<Vehicule | null> {
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
    const rows = this.data.categories.filter((c) =>
      matchesQuery(c.libelle, options?.q),
    )

    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<CategorieVehicule | null> {
    return this.data.categories.find((c) => c.id === id) ?? null
  }

  async create(input: CategorieVehiculeInput): Promise<CategorieVehicule> {
    const row = {
      id: Math.max(0, ...this.data.categories.map((c) => c.id)) + 1,
      ...input,
    }

    this.data.categories.push(row)

    return row
  }

  async update(
    id: number,
    input: Partial<CategorieVehiculeInput>,
  ): Promise<CategorieVehicule | null> {
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
      matchesQuery(
        `${garage.nom} ${garage.adresse ?? ""} ${garage.telephone ?? ""}`,
        options?.q,
      ),
    )
  }

  async get(id: number): Promise<Garage | null> {
    return this.data.garages.find((garage) => garage.id === id) ?? null
  }

  async create(input: GarageInput): Promise<Garage> {
    const garage = {
      id: Math.max(0, ...this.data.garages.map((item) => item.id)) + 1,
      adresse: null,
      telephone: null,
      ...input,
    }

    this.data.garages.push(garage)

    return garage
  }

  async update(
    id: number,
    input: Partial<GarageInput>,
  ): Promise<Garage | null> {
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

      vehicule:
        this.data.vehicules.find((item) => item.id === row.vehiculeId)
          ?.immatriculation ??
        row.vehicule ??
        null,

      garage:
        this.data.garages.find((item) => item.id === row.garageId)?.nom ??
        row.garage ??
        null,
    }
  }

  async list(options?: ListOptions): Promise<PassageGarage[]> {
    const rows = this.data.passagesGarage

      .map((row) => this.hydrate(row))

      .filter((row) =>
        matchesQuery(
          `${row.vehicule ?? ""} ${row.garage ?? ""} ${row.typePassage} ${row.statut} ${row.motif ?? ""}`,
          options?.q,
        ),
      )

    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<PassageGarage | null> {
    const row = this.data.passagesGarage.find((item) => item.id === id)

    return row ? this.hydrate(row) : null
  }

  async update(
    id: number,
    input: Partial<PassageGarageInput>,
  ): Promise<PassageGarage | null> {
    const row = this.data.passagesGarage.find((item) => item.id === id)

    if (!row) return null

    const wasCompleted = row.statut === "TERMINEE"

    Object.assign(row, input)

    if (input.statut === "TERMINEE") {
      const date = new Date()

      row.dateSortieReelle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

      if (!wasCompleted) {
        const vehicle = this.data.vehicules.find(
          (item) => item.id === row.vehiculeId,
        )

        if (vehicle) {
          vehicle.statut = "RETOUR_GARAGE"

          this.data.mouvements.push({
            id: Math.max(0, ...this.data.mouvements.map((item) => item.id)) + 1,

            vehiculeId: row.vehiculeId,

            passageId: row.id,

            type: "RETOUR_GARAGE",

            motif: row.motif,

            kilometrage: vehicle.kilometrage,

            date: date.toISOString(),

            commentaire: "Retour du garage",
          })

          this.data.reparations.push({
            id:
              Math.max(0, ...this.data.reparations.map((item) => item.id)) + 1,

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
    for (const passage of this.data.passagesGarage.filter(
      (item) => item.statut === "TERMINEE",
    )) {
      if (this.data.reparations.some((item) => item.passageId === passage.id))
        continue

      const vehicle = this.data.vehicules.find(
        (item) => item.id === passage.vehiculeId,
      )

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

  async update(
    id: number,
    input: Partial<ReparationInput>,
  ): Promise<Reparation | null> {
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

      categorie:
        this.data.categories.find((c) => c.id === row.categorieId)?.libelle ??
        null,
    }
  }

  async list(options?: ListOptions): Promise<ModeleVehicule[]> {
    const rows = this.data.modeles

      .map((m) => this.withCategory(m))

      .filter((m) =>
        matchesQuery(`${m.marque} ${m.nom} ${m.categorie ?? ""}`, options?.q),
      )

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

  async update(
    id: number,
    input: Partial<ModeleVehiculeInput>,
  ): Promise<ModeleVehicule | null> {
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

      .map((centre) => this.withClient(centre))

      .sort((left, right) => left.nom.localeCompare(right.nom, "fr"))
  }

  async get(id: number): Promise<Centre | null> {
    const centre = this.data.centres.find((row) => row.id === id)

    return centre ? this.withClient(centre) : null
  }

  async create(input: CentreInput): Promise<Centre> {
    const centre: Centre = {
      id: Math.max(0, ...this.data.centres.map((row) => row.id)) + 1,

      ...input,

      client: null,
    }

    this.data.centres.push(centre)

    return this.withClient(centre)
  }

  async update(
    id: number,
    input: Partial<CentreInput>,
  ): Promise<Centre | null> {
    const centre = this.data.centres.find((row) => row.id === id)

    if (!centre) return null

    Object.assign(centre, input)

    return this.withClient(centre)
  }

  async remove(id: number): Promise<boolean> {
    if (this.data.vehicules.some((vehicle) => vehicle.centreId === id)) {
      throw new Error("foreign key constraint: centre utilisé par un véhicule")
    }

    const index = this.data.centres.findIndex((centre) => centre.id === id)

    if (index < 0) return false

    this.data.centres.splice(index, 1)

    return true
  }

  private withClient(centre: Centre): Centre {
    return {
      ...centre,

      client:
        this.data.clients.find((client) => client.id === centre.clientId)
          ?.nom ?? null,
    }
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

        derniereOperation:
          ops.length > 0
            ? ops[ops.length - 1]!.split("-").reverse().join("/")
            : null,
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
      (c) =>
        c.actif !== false && matchesQuery(`${c.nom} ${c.contact}`, options?.q),
    )

    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<Commercial | null> {
    return (
      this.data.commerciaux.find((c) => c.id === id && c.actif !== false) ??
      null
    )
  }

  async fiches(): Promise<CommercialFiche[]> {
    return this.data.commerciaux
      .filter((c) => c.actif !== false)
      .map((c) => {
        const conclues = this.data.locations.filter(
          (l) => l.commercialId === c.id,
        )
        const reservationsConclues = this.data.reservations.filter(
          (r) => r.commercialId === c.id && r.statut !== "Annulée",
        ).length
        const passagesGarageConclues = this.data.mouvements.filter(
          (m) =>
            m.type === "ENVOI_GARAGE" &&
            (m.validateurId === c.id || m.commercialId === c.id),
        ).length
        const ventesConclues = this.data.ventesVehicules.filter(
          (sale) => sale.commercialId === c.id && sale.statut === "CONCLUE",
        ).length

        const chiffreAffaires = conclues.reduce((sum, l) => sum + l.montant, 0)

        const agence = this.data.agences.find((item) => item.id === c.agenceId)

        return {
          ...c,

          agence: agence?.nom ?? null,

          codeAgence: agence?.code ?? null,

          locationsConclues: conclues.length,

          reservationsConclues,

          passagesGarageConclues,

          ventesConclues,

          chiffreAffaires,

          performance: performanceOf(conclues.length),
        }
      })
  }

  async create(input: CommercialInput, _adminId: number): Promise<Commercial> {
    const id =
      Math.max(0, ...this.data.commerciaux.map((commercial) => commercial.id)) +
      1

    const row: Commercial = {
      id,

      nom: [input.prenom, input.nom].filter(Boolean).join(" "),

      nomFamille: input.nom,

      prenom: input.prenom || null,

      abreviation: input.abreviation || null,

      telephone: input.telephone || null,

      email: input.email || null,

      agenceId: input.agenceId ?? null,

      agence:
        this.data.agences.find((agence) => agence.id === input.agenceId)?.nom ??
        null,

      codeAgence:
        this.data.agences.find((agence) => agence.id === input.agenceId)
          ?.code ?? null,

      contact: [input.telephone, input.email].filter(Boolean).join(" · "),

      actif: true,
    }

    this.data.commerciaux.push(row)

    return row
  }

  async importMany(inputs: CommercialInput[], _adminId: number): Promise<{
    created: number
    updated: number
  }> {
    let created = 0

    let updated = 0

    for (const input of inputs) {
      const abbreviation = input.abreviation?.trim().toUpperCase()

      const existing = this.data.commerciaux.find(
        (commercial) =>
          commercial.abreviation?.trim().toUpperCase() === abbreviation,
      )

      if (existing) {
        existing.nom = [input.prenom, input.nom].filter(Boolean).join(" ")

        existing.nomFamille = input.nom

        existing.prenom = input.prenom || null

        existing.abreviation = abbreviation

        existing.telephone = input.telephone || null

        existing.email = input.email || null

        existing.contact = [input.telephone, input.email]
          .filter(Boolean)
          .join(" · ")

        existing.agenceId = input.agenceId ?? null

        const agence = this.data.agences.find(
          (item) => item.id === input.agenceId,
        )

        existing.agence = agence?.nom ?? null

        existing.codeAgence = agence?.code ?? null

        updated += 1
      } else {
        await this.create(input, _adminId)

        created += 1
      }
    }

    return { created, updated }
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

    if (input.agenceId !== undefined) {
      const agence = this.data.agences.find(
        (item) => item.id === input.agenceId,
      )

      row.agenceId = input.agenceId

      row.agence = agence?.nom ?? null

      row.codeAgence = agence?.code ?? null
    }

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

  ignoreReservationId?: number,
): void {
  const vehicle = data.vehicules.find((row) => row.id === vehiculeId)

  if (!vehicle) throw new Error("Véhicule introuvable")

  if (
    ![
      "ENTREE_PARC",
      "RETOUR_LOCATION",
      "RETOUR_INTERNE",
      "RETOUR_GARAGE",
      "MISE_EN_LOCATION",
    ].includes(vehicle.statut)
  ) {
    throw new AvailabilityConflictError(
      "Véhicule indisponible pour la location",
    )
  }

  const maintenance = data.maintenances.find(
    (row) =>
      row.vehiculeId === vehiculeId &&
      row.id !== ignoreReservationId &&
      row.statut === "En cours" &&
      overlaps(row.dateEntree, row.dateSortie ?? "9999-12-31", debut, fin),
  )

  if (maintenance) {
    throw new AvailabilityConflictError(
      `Véhicule au garage sur la période${
        maintenance.motif ? ` (${maintenance.motif})` : ""
      }`,
    )
  }

  if (
    data.locations.some(
      (row) =>
        row.vehiculeId === vehiculeId &&
        ACTIVE_LOCATION.includes(row.statut) &&
        overlaps(
          row.dateDebut,
          row.statut === "EN_RETARD" ? "9999-12-31" : row.dateFin,
          debut,
          fin,
        ),
    )
  ) {
    throw new AvailabilityConflictError("Véhicule déjà loué sur la période")
  }

  if (
    data.reservations.some(
      (row) =>
        row.vehiculeId === vehiculeId &&
        ["À venir", "En cours"].includes(row.statut) &&
        row.dateDepart &&
        overlaps(
          row.dateDepart,
          row.dateFin ?? addDays(row.dateDepart, row.dureeJours),
          debut,
          fin,
        ),
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

      if (
        prolongation.statut === "EN_COURS" &&
        Number.isFinite(end) &&
        end < now
      ) {
        prolongation.statut = "EXPIRE"
      }
    }

    for (const location of this.data.locations) {
      const end = Date.parse(location.dateFin.replace(" ", "T"))

      const hasActiveProlongation = this.data.prolongations.some(
        (item) => item.locationId === location.id && item.statut === "EN_COURS",
      )

      if (
        Number.isFinite(end) &&
        end < now &&
        (location.statut === "EN_COURS" ||
          (location.statut === "EN_PROLONGATION" && !hasActiveProlongation))
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

    const rows = this.data.locations.map((l) =>
      toFiche(l, this.data.clients, this.data.vehicules),
    )

    return limit ? rows.slice(0, limit) : rows
  }

  async get(id: number): Promise<Location | null> {
    await this.refreshStatuses()

    return this.data.locations.find((l) => l.id === id) ?? null
  }

  async create(input: LocationInput, _adminId?: number): Promise<Location> {
    const vehicle = this.data.vehicules.find(
      (item) => item.id === input.vehiculeId,
    )
    const kmDepart = vehicle?.kilometrage ?? 0
    const location: Location = {
      id: Math.max(0, ...this.data.locations.map((item) => item.id)) + 1,

      reference:
        input.reference?.trim() || `LOC-${String(Date.now()).slice(-5)}`,

      clientId: input.clientId,

      vehiculeId: input.vehiculeId,

      commercialId: input.commercialId ?? null,

      type: input.type,

      dateDebut: input.dateDebut,

      dateFin: input.dateFin,

      dateRetourReelle: input.statut === "TERMINEE" ? localDateTimeNow() : null,

      kmDepart,

      kmRetour: input.kmRetour ?? null,

      kmParcourus:
        input.kmRetour == null ? null : input.kmRetour - kmDepart,

      montant: input.montant ?? 0,

      statut: input.statut ?? "EN_COURS",

      observation: input.observation?.trim() || null,

      modePaiement: input.modePaiement?.trim() || null,

      referenceFacture: input.referenceFacture?.trim() || null,

      dateFacturation: input.dateFacturation?.slice(0, 10) || null,

      paye: input.paye ?? false,

      payeImport: input.payeImport ?? null,

      datePaiement: input.datePaiement?.slice(0, 10) || null,
    }

    const end = Date.parse(location.dateFin.replace(" ", "T"))

    if (
      location.statut === "EN_COURS" &&
      Number.isFinite(end) &&
      end < Date.now()
    ) {
      location.statut = "EN_RETARD"
    }

    this.data.locations.push(location)

    const movementType =
      location.statut === "TERMINEE" ? "RETOUR_LOCATION" : "MISE_EN_LOCATION"

    if (vehicle) vehicle.statut = movementType

    this.data.mouvements.push({
      id: Math.max(0, ...this.data.mouvements.map((item) => item.id)) + 1,

      vehiculeId: location.vehiculeId,

      locationId: location.id,

      type: movementType,

      motif: "LOCATION",

      kilometrage: vehicle?.kilometrage ?? null,

      date: new Date().toISOString(),

      commentaire: location.reference,
    })

    return location
  }

  async update(
    id: number,
    input: Partial<LocationInput>,
  ): Promise<Location | null> {
    await this.refreshStatuses()

    const location = this.data.locations.find((item) => item.id === id)

    if (!location) return null

    const wasCompleted = location.statut === "TERMINEE"

    Object.assign(location, {
      ...input,

      reference: input.reference?.trim() || location.reference,
    })

    if (input.kmRetour !== undefined) {
      location.kmParcourus =
        input.kmRetour == null
          ? null
          : input.kmRetour - (location.kmDepart ?? 0)
    }

    const end = Date.parse(location.dateFin.replace(" ", "T"))

    if (
      location.statut === "EN_COURS" &&
      Number.isFinite(end) &&
      end < Date.now()
    ) {
      location.statut = "EN_RETARD"
    }

    if (location.statut === "TERMINEE") {
      if (!wasCompleted) location.dateRetourReelle = localDateTimeNow()

      const vehicle = this.data.vehicules.find(
        (item) => item.id === location.vehiculeId,
      )

      if (vehicle) vehicle.statut = "RETOUR_LOCATION"

      if (!wasCompleted) {
        this.data.mouvements.push({
          id: Math.max(0, ...this.data.mouvements.map((item) => item.id)) + 1,

          vehiculeId: location.vehiculeId,

          locationId: location.id,

          type: "RETOUR_LOCATION",

          motif: "LOCATION",

          kilometrage: location.kmRetour ?? vehicle?.kilometrage ?? null,

          date: new Date().toISOString().slice(0, 10),

          commentaire: location.reference,
        })
      }
    } else {
      location.dateRetourReelle = null

      if (wasCompleted) {
        const vehicle = this.data.vehicules.find(
          (item) => item.id === location.vehiculeId,
        )

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

        kilometrage:
          this.data.vehicules.find((item) => item.id === location.vehiculeId)
            ?.kilometrage ?? null,

        date: new Date().toISOString().slice(0, 10),

        commentaire: `Clôture de ${location.reference}`,
      })
    }

    for (const movement of this.data.mouvements) {
      if (movement.locationId === id) movement.locationId = null
    }

    const vehicle = this.data.vehicules.find(
      (item) => item.id === location.vehiculeId,
    )

    const latest = this.data.mouvements

      .filter((item) => item.vehiculeId === location.vehiculeId)

      .sort((a, b) =>
        a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1,
      )[0]

    if (vehicle) vehicle.statut = latest?.type ?? "ENTREE_PARC"

    return true
  }

  async forClient(clientId: number): Promise<LocationFiche[]> {
    await this.refreshStatuses()

    return this.data.locations

      .filter((l) => l.clientId === clientId)

      .map((l) => toFiche(l, this.data.clients, this.data.vehicules))
  }

  async overlapping(
    vehiculeId: number,
    debut: string,
    fin: string,
  ): Promise<Location[]> {
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

  async update(
    id: number,
    input: Partial<ProlongationInput>,
  ): Promise<Prolongation | null> {
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
  private statusHistory = new Map<number, ReservationHistoryEntry[]>()

  constructor(private data: SeedData) {}

  private recordStatus(
    reservation: Reservation,
    previousStatus: string | null,
    nextStatus: string,
    commentaire: string,
  ): void {
    const history = this.statusHistory.get(reservation.id) ?? []
    history.unshift({
      id: history.length + 1,
      ancienStatut: previousStatus,
      nouveauStatut: nextStatus,
      dateChangement: localDateTimeNow(),
      commentaire,
    })
    this.statusHistory.set(reservation.id, history)
  }

  async refreshStatuses(): Promise<void> {
    const now = localDateTimeNow()
    const today = now.slice(0, 10)
    const time = now.slice(11, 19)

    for (const reservation of this.data.reservations) {
      const endDate =
        reservation.dateFin ??
        (reservation.dateDepart
          ? addDays(reservation.dateDepart, reservation.dureeJours)
          : null)
      if (
        reservation.statut === "À venir" &&
        reservation.dateDepart &&
        (reservation.dateDepart < today ||
          (reservation.dateDepart === today && time >= "23:59:00"))
      ) {
        this.recordStatus(
          reservation,
          reservation.statut,
          "Annulée",
          "Annulation automatique à 23 h 59.",
        )
        reservation.statut = "Annulée"
        const vehicle = this.data.vehicules.find(
          (item) => item.id === reservation.vehiculeId,
        )
        if (
          vehicle &&
          !this.data.reservations.some(
            (item) =>
              item.id !== reservation.id &&
              item.vehiculeId === reservation.vehiculeId &&
              ["À venir", "En cours"].includes(item.statut),
          )
        ) {
          vehicle.statut = "ENTREE_PARC"
        }
      } else if (
        reservation.statut === "En cours" &&
        endDate &&
        (endDate < today || (endDate === today && time >= "23:59:00"))
      ) {
        this.recordStatus(
          reservation,
          reservation.statut,
          "Terminée",
          "Clôture automatique à 23 h 59.",
        )
        reservation.statut = "Terminée"
        const vehicle = this.data.vehicules.find(
          (item) => item.id === reservation.vehiculeId,
        )
        if (
          vehicle &&
          !this.data.reservations.some(
            (item) =>
              item.id !== reservation.id &&
              item.vehiculeId === reservation.vehiculeId &&
              ["À venir", "En cours"].includes(item.statut),
          )
        ) {
          vehicle.statut = "ENTREE_PARC"
        }
      }
    }
  }

  async list(options?: ListOptions): Promise<Reservation[]> {
    await this.refreshStatuses()

    const rows = this.data.reservations.filter((r) =>
      matchesQuery(`${r.reference} ${r.statut}`, options?.q),
    )

    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async fiches(): Promise<ReservationFiche[]> {
    await this.refreshStatuses()

    return this.data.reservations.map((r) => {
      const vehicle = this.data.vehicules.find((v) => v.id === r.vehiculeId)
      return {
        ...r,
        client:
          this.data.clients.find((c) => c.id === r.clientId)?.nom ??
          r.clientImport ??
          "",
        commercial: r.commercialId
          ? (this.data.commerciaux.find((c) => c.id === r.commercialId)?.nom ??
            r.commercialImport ??
            null)
          : (r.commercialImport ?? null),
        vehicule:
          vehicle?.marqueModele ??
          `${vehicle?.marque ?? ""} ${vehicle?.modele ?? ""}`.trim(),
        immatriculation: vehicle?.immatriculation ?? "",
      }
    })
  }

  async lostAffairsFromReservations(): Promise<ReservationLostAffairExportRow[]> {
    await this.refreshStatuses()
    const cancellationDate = localDateTimeNow().slice(0, 10)

    return this.data.reservations
      .filter((reservation) => reservation.statut === "Annulée")
      .map((reservation) => {
        const vehicle = this.data.vehicules.find(
          (item) => item.id === reservation.vehiculeId,
        )
        return {
          agentVente:
            this.data.commerciaux.find(
              (item) => item.id === reservation.commercialId,
            )?.nom ??
            reservation.commercialImport ??
            null,
          refProforma: null,
          dateReservation: reservation.dateReservation ?? null,
          client:
            this.data.clients.find((item) => item.id === reservation.clientId)
              ?.nom ??
            reservation.clientImport ??
            null,
          refBonCommande: null,
          relance: null,
          dateAnnulation: cancellationDate,
          motifAnnulation: null,
          vehiculeDemande:
            vehicle?.marqueModele ??
            `${vehicle?.marque ?? ""} ${vehicle?.modele ?? ""}`.trim() ??
            null,
          vehiculePropose: null,
        }
      })
  }

  async get(id: number): Promise<Reservation | null> {
    await this.refreshStatuses()

    return this.data.reservations.find((r) => r.id === id) ?? null
  }

  async history(id: number): Promise<ReservationHistoryEntry[]> {
    return [...(this.statusHistory.get(id) ?? [])]
  }

  async overlapping(
    vehiculeId: number,
    debut: string,
    fin: string,
  ): Promise<Reservation[]> {
    await this.refreshStatuses()

    return this.data.reservations.filter((r) => {
      if (r.vehiculeId !== vehiculeId) return false

      if (!["À venir", "En cours"].includes(r.statut)) return false

      if (!r.dateDepart || !r.dateFin) return false

      return overlaps(r.dateDepart, r.dateFin, debut, fin)
    })
  }

  async create(input: ReservationInput): Promise<Reservation> {
    await this.refreshStatuses()

    if (input.dateDepart && input.dateFin) {
      assertMemoryVehicleAvailable(
        this.data,
        input.vehiculeId,
        input.dateDepart,
        input.dateFin,
      )
    }

    const id =
      Math.max(
        0,
        ...this.data.reservations.map((reservation) => reservation.id),
      ) + 1

    const dureeJours =
      input.dateDepart && input.dateFin
        ? Math.max(
            1,
            Math.round(
              (Date.parse(`${input.dateFin}T00:00:00Z`) -
                Date.parse(`${input.dateDepart}T00:00:00Z`)) /
                86_400_000,
            ),
          )
        : 0

    const row: Reservation = {
      id,

      reference: `RES-${String(id).padStart(5, "0")}`,

      clientId: input.clientId,

      vehiculeId: input.vehiculeId,

      commercialId: input.commercialId,

      dateReservation: input.dateReservation ?? undefined,

      dateDepart: input.dateDepart ?? "",

      dateFin: input.dateFin,

      dureeJours,

      mission: input.mission ?? null,

      lieuMission: input.lieuMission ?? null,

      statutConfirmation: input.statutConfirmation ?? null,

      statutFacturation: input.statutFacturation ?? "NON_FACTUREE",

      statutPaiement: input.statutPaiement ?? "NON_PAYEE",

      statut: "À venir",
    }

    this.data.reservations.push(row)
    const vehicle = this.data.vehicules.find(
      (item) => item.id === input.vehiculeId,
    )
    if (vehicle) vehicle.statut = "RESERVATION"
    this.recordStatus(row, null, row.statut, "Création de la réservation.")

    await this.refreshStatuses()

    return row
  }

  async importMany(inputs: ReservationImportInput[]): Promise<number> {
    await this.refreshStatuses()
    const today = localDateTimeNow().slice(0, 10)
    const newReservations: Reservation[] = []

    for (const input of inputs) {
      const startDate = input.dateDepart
      const endDate = input.dateFin
      const shouldCheckAvailability =
        (input.statut === "À venir" &&
          input.dateDepart !== null &&
          input.dateDepart >= today) ||
        (input.statut === "En cours" &&
          input.dateFin !== null &&
          input.dateFin >= today)
      if (shouldCheckAvailability && startDate && endDate) {
        assertMemoryVehicleAvailable(
          this.data,
          input.vehiculeId,
          startDate,
          endDate,
        )
        if (
          newReservations.some(
            (reservation) =>
              reservation.vehiculeId === input.vehiculeId &&
              ["À venir", "En cours"].includes(reservation.statut) &&
              reservation.dateDepart &&
              overlaps(
                reservation.dateDepart,
                reservation.dateFin ??
                  addDays(reservation.dateDepart, reservation.dureeJours),
                startDate,
                endDate,
              ),
          )
        ) {
          throw new AvailabilityConflictError(
            "Véhicule déjà réservé sur la période",
          )
        }
      }

      const id =
        Math.max(
          0,
          ...this.data.reservations.map((reservation) => reservation.id),
          ...newReservations.map((reservation) => reservation.id),
        ) + 1
      const duration =
        input.dateDepart && input.dateFin
          ? Math.max(
              1,
              Math.round(
                (Date.parse(`${input.dateFin}T00:00:00Z`) -
                  Date.parse(`${input.dateDepart}T00:00:00Z`)) /
                  86_400_000,
              ),
            )
          : 0
      newReservations.push({
        id,
        reference: `RES-${String(id).padStart(5, "0")}`,
        clientId: input.clientId,
        vehiculeId: input.vehiculeId,
        commercialId: input.commercialId,
        dateDepart: input.dateDepart ?? "",
        dateFin: input.dateFin,
        dateReservation: input.dateReservation ?? undefined,
        dureeJours: input.dureeJours ?? duration,
        mission: input.mission,
        lieuMission: input.lieuMission,
        statutConfirmation: input.statutConfirmation,
        statutFacturation: input.statutFacturation,
        statutPaiement: input.statutPaiement,
        clientImport: input.clientImport,
        commercialImport: input.commercialImport,
        statut: input.statut,
      })
      if (["À venir", "En cours"].includes(input.statut)) {
        const vehicle = this.data.vehicules.find(
          (item) => item.id === input.vehiculeId,
        )
        if (vehicle) vehicle.statut = "RESERVATION"
      }
    }

    this.data.reservations.push(...newReservations)
    for (const reservation of newReservations) {
      this.recordStatus(
        reservation,
        null,
        reservation.statut,
        "Import de la réservation.",
      )
    }
    await this.refreshStatuses()
    return inputs.length
  }

  async update(
    id: number,
    input: ReservationUpdateInput,
  ): Promise<Reservation | null> {
    await this.refreshStatuses()
    const reservation = this.data.reservations.find((item) => item.id === id)
    if (!reservation) return null
    if (
      ["À venir", "En cours"].includes(reservation.statut) &&
      input.dateDepart &&
      input.dateFin
    ) {
      assertMemoryVehicleAvailable(
        this.data,
        input.vehiculeId,
        input.dateDepart,
        input.dateFin,
        id,
      )
    }
    Object.assign(reservation, input, {
      dateDepart: input.dateDepart ?? "",
      dateFin: input.dateFin,
      dureeJours:
        input.dateDepart && input.dateFin
          ? Math.max(
              1,
              Math.round(
                (Date.parse(`${input.dateFin}T00:00:00Z`) -
                  Date.parse(`${input.dateDepart}T00:00:00Z`)) /
                  86_400_000,
              ),
            )
          : 0,
    })
    await this.refreshStatuses()
    return reservation
  }

  async remove(id: number): Promise<boolean> {
    if (this.data.locations.some((location) => location.reservationId === id)) {
      throw new ReservationInUseError()
    }
    const index = this.data.reservations.findIndex(
      (reservation) => reservation.id === id,
    )
    if (index < 0) return false
    this.data.reservations.splice(index, 1)
    this.statusHistory.delete(id)
    return true
  }

  async updateStatus(
    id: number,
    status: Reservation["statut"],
  ): Promise<Reservation | null> {
    await this.refreshStatuses()
    const reservation = this.data.reservations.find((item) => item.id === id)
    if (!reservation) return null

    const now = localDateTimeNow()
    const today = now.slice(0, 10)
    const time = now.slice(11, 19)
    const canStart =
      reservation.statut === "À venir" &&
      status === "En cours" &&
      reservation.dateDepart === today &&
      time < "23:59:00"
    const canCancel = reservation.statut === "À venir" && status === "Annulée"
    const canComplete =
      reservation.statut === "En cours" && status === "Terminée"
    if (!canStart && !canCancel && !canComplete) {
      throw new ReservationStatusConflictError(
        "Cette transition de statut n’est pas autorisée.",
      )
    }

    const previousStatus = reservation.statut
    reservation.statut = status
    if (status === "Annulée" || status === "Terminée") {
      const vehicle = this.data.vehicules.find(
        (item) => item.id === reservation.vehiculeId,
      )
      if (vehicle) vehicle.statut = "ENTREE_PARC"
    }
    this.recordStatus(reservation, previousStatus, status, "Statut modifié.")
    return reservation
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

  async overlapping(
    vehiculeId: number,
    debut: string,
    fin: string,
  ): Promise<Maintenance[]> {
    return this.data.maintenances.filter(
      (maintenance) =>
        maintenance.vehiculeId === vehiculeId &&
        maintenance.statut === "En cours" &&
        overlaps(
          maintenance.dateEntree,
          maintenance.dateSortie ?? "9999-12-31",
          debut,
          fin,
        ),
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

  async createEntry(input: {
    vehiculeId: number
    date: string
    kilometrage: number
    observation?: string | null
  }): Promise<void> {
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

    validateurId?: number

    dateDebut?: string

    dateFin?: string

    sortieInterne?: {
      commercialId: number
      motif: string
    }
  }): Promise<Mouvement> {
    const vehicle = this.data.vehicules.find((v) => v.id === input.vehiculeId)

    if (!vehicle) throw new Error("Véhicule introuvable")

    const movement: Mouvement = {
      id: Math.max(0, ...this.data.mouvements.map((m) => m.id)) + 1,

      vehiculeId: input.vehiculeId,

      locationId: null,

      passageId: null,

      commercialId:
        input.statut === "MISE_EN_LOCATION" || input.statut === "SORTIE_INTERNE"
          ? (input.commercialId ?? null)
          : null,

      validateurId: input.validateurId ?? null,

      type: input.statut,

      motif:
        input.statut === "SORTIE_INTERNE"
          ? (input.sortieInterne?.motif ?? input.motif ?? null)
          : (input.motif ?? null),

      kilometrage: input.kilometrage,

      date: new Date().toISOString(),

      commentaire: input.observation ?? null,
    }

    const departure =
      input.statut === "RETOUR_INTERNE" ||
      input.statut === "RETOUR_LOCATION" ||
      input.statut === "RETOUR_GARAGE"
        ? [...this.data.mouvements]
            .reverse()
            .find(
              (item) =>
                item.vehiculeId === input.vehiculeId &&
                ((input.statut === "RETOUR_INTERNE" &&
                  item.type === "SORTIE_INTERNE") ||
                  (input.statut === "RETOUR_LOCATION" &&
                    item.type === "MISE_EN_LOCATION") ||
                  (input.statut === "RETOUR_GARAGE" &&
                    item.type === "ENVOI_GARAGE")),
            )
        : undefined

    if (departure) {
      movement.date = localDateTimeNow()
      movement.kmDepart = departure.kilometrage
      movement.kmRetour = input.kilometrage
      movement.kmParcourus =
        departure.kilometrage == null
          ? null
          : input.kilometrage - departure.kilometrage
      movement.dateRetour = movement.date
      departure.kmRetour = input.kilometrage
      departure.kmParcourus =
        departure.kilometrage == null
          ? null
          : input.kilometrage - departure.kilometrage
      departure.dateRetour = movement.date
    } else {
      movement.kmDepart = input.kilometrage
      movement.kmRetour = null
      movement.kmParcourus = null
      movement.dateRetour = null
    }

    vehicle.statut = input.statut

    vehicle.kilometrage = Math.max(vehicle.kilometrage, input.kilometrage)

    this.data.mouvements.push(movement)

    if (input.statut === "SORTIE_INTERNE" && input.sortieInterne) {
      movement.commercialId = input.sortieInterne.commercialId
      movement.motif = input.sortieInterne.motif
    }

    if (input.statut === "MISE_EN_LOCATION") {
      const client =
        this.data.clients.find((item) => item.id === input.clientId) ??
        this.data.clients[0]

      if (!client)
        throw new Error("Aucun client disponible pour créer la location")

      const location: Location = {
        id: Math.max(0, ...this.data.locations.map((item) => item.id)) + 1,

        reference: `LOC-${String(Date.now()).slice(-5)}`,

        clientId: client.id,

        vehiculeId: input.vehiculeId,

        commercialId:
          input.commercialId ?? this.data.commerciaux[0]?.id ?? null,

        type: input.typeLocation ?? "Courte durée",

        dateDebut: input.dateDebut ?? movement.date,

        dateFin:
          input.dateFin ??
          addDays(
            movement.date,
            input.typeLocation === "Longue durée" ? 30 : 1,
          ),

        montant: 0,

        dateRetourReelle: null,

        statut: "EN_COURS",
      }

      this.data.locations.push(location)

      movement.locationId = location.id
    } else if (input.statut === "RETOUR_LOCATION") {
      const location = this.data.locations

        .filter(
          (item) =>
            item.vehiculeId === input.vehiculeId &&
            ACTIVE_LOCATION.includes(item.statut),
        )

        .sort((a, b) => (a.dateFin < b.dateFin ? 1 : -1))[0]

      if (location) {
        location.statut = "TERMINEE"

        location.dateRetourReelle = localDateTimeNow()

        movement.locationId = location.id
      }
    }

    if (input.statut === "ENVOI_GARAGE") {
      const garage =
        this.data.garages.find((item) => item.id === input.garageId) ??
        this.data.garages[0]

      if (!garage)
        throw new Error("Aucun garage disponible pour enregistrer le passage")

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

      movement.passageId =
        this.data.passagesGarage[this.data.passagesGarage.length - 1]?.id ?? null
    }

    return movement
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.mouvements.findIndex((item) => item.id === id)

    if (index < 0) return false

    const [removed] = this.data.mouvements.splice(index, 1)

    const location = removed?.locationId
      ? this.data.locations.find((item) => item.id === removed.locationId)
      : null

    if (location && removed?.type === "RETOUR_LOCATION") {
      location.statut = "EN_COURS"

      location.dateRetourReelle = null
    }

    const vehicle = this.data.vehicules.find(
      (item) => item.id === removed!.vehiculeId,
    )

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
      matchesQuery(
        `${sale.numeroVente} ${sale.vehiculeId} ${sale.acheteurId} ${sale.statut}`,
        options?.q,
      ),
    )

    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<VenteVehicule | null> {
    return this.data.ventesVehicules.find((sale) => sale.id === id) ?? null
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.ventesVehicules.findIndex((sale) => sale.id === id)
    if (index < 0) return false

    const sale = this.data.ventesVehicules[index]
    this.data.ventesVehicules.splice(index, 1)

    const movementIndex = this.data.mouvements.findIndex(
      (movement) => movement.id === sale?.mouvementId,
    )
    if (movementIndex >= 0) {
      this.data.mouvements.splice(movementIndex, 1)
    }

    const vehicle = this.data.vehicules.find(
      (item) => item.id === sale?.vehiculeId,
    )
    const latest = this.data.mouvements
      .filter((movement) => movement.vehiculeId === sale?.vehiculeId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    if (vehicle) {
      vehicle.statut = latest?.type ?? "ENTREE_PARC"
      vehicle.kilometrage = latest?.kilometrage ?? vehicle.kilometrage
    }

    return true
  }

  async isMovementLinked(movementId: number): Promise<boolean> {
    return (
      this.data.ventesVehicules.some(
        (sale) => sale.mouvementId === movementId,
      ) ||
      this.data.mouvements.some(
        (movement) => movement.id === movementId && movement.locationId != null,
      )
    )
  }

  async create(
    input: VenteVehiculeInput,
    adminId: number,
  ): Promise<VenteVehicule> {
    const vehicle = this.data.vehicules.find(
      (item) => item.id === input.vehiculeId,
    )

    if (!vehicle) throw new Error("Véhicule introuvable")

    if (
      this.data.ventesVehicules.some(
        (sale) =>
          sale.vehiculeId === input.vehiculeId && sale.statut === "CONCLUE",
      )
    ) {
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

class MemoryContraventionRepo implements ContraventionRepo {
  constructor(private data: SeedData) {}

  private mapInput(id: number, input: ContraventionInput): Contravention {
    const vehicle = this.data.vehicules.find(
      (item) => item.id === input.vehiculeId,
    )
    if (!vehicle) throw new Error("Véhicule introuvable")

    return {
      id,
      numeroContravention: input.numeroContravention,
      type: input.type,
      dateInfraction: input.dateInfraction,
      montant: input.montant,
      frais: input.frais ?? 0,
      devise: "XOF",
      statutPaiement: input.statutPaiement,
      dateReglement: input.dateReglement ?? null,
      moyenPaiement: input.moyenPaiement ?? null,
      numeroQuittance: input.numeroQuittance ?? null,
      payeur: input.payeur ?? null,
      statutRecouvrement: input.statutRecouvrement,
      dateRecouvrement: input.dateRecouvrement ?? null,
      montantRecouvre: input.montantRecouvre ?? 0,
      fraisRecouvres: input.fraisRecouvres ?? 0,
      vehiculeId: input.vehiculeId,
      immatriculation: vehicle.immatriculation,
      marque: vehicle.marque ?? "",
      modele: vehicle.modele ?? "",
      vehicule:
        vehicle.marqueModele ??
        `${vehicle.marque ?? ""} ${vehicle.modele ?? ""}`.trim(),
      clientId: input.clientId ?? null,
      client:
        this.data.clients.find((item) => item.id === input.clientId)?.nom ??
        input.clientImport ??
        null,
      clientImport: input.clientImport ?? null,
      commercialId: input.commercialId ?? null,
      commercial:
        this.data.commerciaux.find((item) => item.id === input.commercialId)
          ?.nom ??
        input.commercialImport ??
        null,
      commercialImport: input.commercialImport ?? null,
      observation: input.observation ?? null,
    }
  }

  async list(options?: ListOptions): Promise<Contravention[]> {
    const rows = this.data.contraventions.filter((item) =>
      matchesQuery(
        `${item.numeroContravention} ${item.type} ${item.immatriculation} ${item.client} ${item.commercial}`,
        options?.q,
      ),
    )
    return options?.limit ? rows.slice(0, options.limit) : rows
  }

  async get(id: number): Promise<Contravention | null> {
    return this.data.contraventions.find((item) => item.id === id) ?? null
  }

  async create(input: ContraventionInput): Promise<Contravention> {
    if (
      this.data.contraventions.some(
        (item) => item.numeroContravention === input.numeroContravention,
      )
    ) {
      throw new Error("Ce numéro de contravention existe déjà")
    }
    const id =
      Math.max(0, ...this.data.contraventions.map((item) => item.id)) + 1
    const row = this.mapInput(id, input)
    this.data.contraventions.push(row)
    return row
  }

  async update(
    id: number,
    input: ContraventionInput,
  ): Promise<Contravention | null> {
    const index = this.data.contraventions.findIndex((item) => item.id === id)
    if (index < 0) return null
    if (
      this.data.contraventions.some(
        (item) =>
          item.id !== id &&
          item.numeroContravention === input.numeroContravention,
      )
    ) {
      throw new Error("Ce numéro de contravention existe déjà")
    }
    const row = this.mapInput(id, input)
    this.data.contraventions[index] = row
    return row
  }

  async remove(id: number): Promise<boolean> {
    const index = this.data.contraventions.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.data.contraventions.splice(index, 1)
    return true
  }

  async importMany(inputs: ContraventionInput[]): Promise<number> {
    const seen = new Set(
      this.data.contraventions.map((item) => item.numeroContravention),
    )
    for (const input of inputs) {
      if (seen.has(input.numeroContravention)) {
        throw new Error(
          `Le numéro de contravention ${input.numeroContravention} existe déjà.`,
        )
      }
      seen.add(input.numeroContravention)
    }
    const startId =
      Math.max(0, ...this.data.contraventions.map((item) => item.id)) + 1
    const rows = inputs.map((input, index) =>
      this.mapInput(startId + index, input),
    )
    this.data.contraventions.push(...rows)
    return rows.length
  }
}

class MemoryStatsRepo implements StatsRepo {
  constructor(private data: SeedData) {}

  async overview(params?: StatsPeriod): Promise<OverviewStats> {
    await new MemoryReservationRepo(this.data).refreshStatuses()

    const locations = this.filterByPeriod(this.data.locations, params)

    const caTotal = locations.reduce((sum, l) => sum + l.montant, 0)

    const vehiculesDisponibles = this.data.vehicules.filter(
      (v) =>
        v.statut === "ENTREE_PARC" ||
        v.statut === "RETOUR_LOCATION" ||
        v.statut === "RETOUR_INTERNE" ||
        v.statut === "RETOUR_GARAGE",
    ).length

    const locationsActives = locations.filter((l) =>
      ACTIVE_LOCATION.includes(l.statut),
    ).length

    const abouties = this.filterByPeriod(this.data.reservations, params).filter(
      (r) => r.statut === "En cours" || r.statut === "Terminée",
    ).length

    const round1 = (n: number): number => Math.round(n * 10) / 10

    const now = Date.now()

    const dayMs = 24 * 60 * 60 * 1000

    const caCurr = this.filterByPeriod(this.data.locations, params).reduce(
      (s, l) => {
        const d = new Date(l.dateDebut).getTime()

        return s + (d >= now - 30 * dayMs ? l.montant : 0)
      },
      0,
    )

    const caPrev = this.filterByPeriod(this.data.locations, params).reduce(
      (s, l) => {
        const d = new Date(l.dateDebut).getTime()

        return (
          s + (d >= now - 60 * dayMs && d < now - 30 * dayMs ? l.montant : 0)
        )
      },
      0,
    )

    const caCroissance =
      caPrev > 0
        ? `${Math.round(((caCurr - caPrev) / caPrev) * 100)}%`
        : caCurr > 0
          ? "+100%"
          : "0%"

    return {
      caTotal,

      devise: "FCFA",

      caCroissance,

      vehiculesDisponibles,

      vehiculesTotal: this.data.vehicules.length,

      locationsActives,

      reservationsEnAttente: this.filterByPeriod(
        this.data.reservations,
        params,
      ).filter((r) => r.statut === "À venir").length,

      tauxUtilisation:
        this.data.vehicules.length > 0
          ? round1((locationsActives / this.data.vehicules.length) * 100)
          : 0,

      tauxRotation:
        this.data.vehicules.length > 0
          ? round1(locations.length / this.data.vehicules.length)
          : 0,

      reservationsAbouties: abouties,

      reservationsTotal: this.filterByPeriod(this.data.reservations, params)
        .length,
    }
  }

  async monthly(params?: StatsPeriod): Promise<MonthlyPoint[]> {
    const today = new Date()

    const data = new Map<string, {
      mois: string
      courte: number
      longue: number
    }>()

    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)

      const key = d.toISOString().slice(0, 7)

      const label = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(
        d,
      )

      data.set(key, { mois: label, courte: 0, longue: 0 })
    }

    for (const loc of this.filterByPeriod(this.data.locations, params)) {
      const key = new Date(loc.dateDebut).toISOString().slice(0, 7)

      const entry = data.get(key)

      if (entry) {
        if (loc.type === "Courte durée") entry.courte += 1
        else entry.longue += 1
      }
    }

    return Array.from(data.values())
  }

  async daily(params?: StatsPeriod): Promise<DailyStat[]> {
    const byDate = new Map<string, number>()

    const today = new Date()

    for (const loc of this.filterByPeriod(this.data.locations, params)) {
      const date = String(loc.dateDebut).slice(0, 10)

      byDate.set(date, (byDate.get(date) ?? 0) + loc.montant)
    }

    const stats: DailyStat[] = []

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)

      d.setDate(today.getDate() - i)

      const iso = d.toISOString().slice(0, 10)

      stats.push({ date: iso, montant: byDate.get(iso) ?? 0 })
    }

    return stats
  }

  async fleetStatus(): Promise<FleetStatus> {
    const counts = new Map<string, number>()

    for (const v of this.data.vehicules) {
      counts.set(v.statut, (counts.get(v.statut) ?? 0) + 1)
    }

    const disponible =
      (counts.get("ENTREE_PARC") ?? 0) +
      (counts.get("RETOUR_LOCATION") ?? 0) +
      (counts.get("RETOUR_INTERNE") ?? 0) +
      (counts.get("RETOUR_GARAGE") ?? 0)

    return {
      disponible,

      enLocation: counts.get("MISE_EN_LOCATION") ?? 0,

      entretien: counts.get("ENVOI_GARAGE") ?? 0,

      indisponible:
        (counts.get("SORTIE_INTERNE") ?? 0) +
        (counts.get("SORTIE_DEFINITIVE") ?? 0) +
        (counts.get("RESERVATION") ?? 0),
    }
  }

  async immobilisationsSinistres(): Promise<SinistreImmobilisation[]> {
    return []
  }

  private filterByPeriod<
    T extends { dateDebut?: string; dateDepart?: string },
  >(
    rows: T[],
    params?: StatsPeriod,
  ): T[] {
    if (!params) return rows

    const debut = params.debut ? new Date(params.debut).getTime() : null

    const fin = params.fin ? new Date(params.fin).getTime() : null

    if (!debut && !fin) return rows

    return rows.filter((row) => {
      const dateVal = row.dateDebut ?? row.dateDepart

      if (!dateVal) return true

      const t = new Date(dateVal).getTime()

      if (debut && t < debut) return false

      if (fin && t > fin) return false

      return true
    })
  }
}

export async function memoryRepositories(): Promise<Repositories> {
  const data = await buildSeedData()

  return {
    admins: new MemoryAdminRepo(data),

    agences: new MemoryAgenceRepo(data),

    categories: new MemoryCategorieRepo(data),

    modeles: new MemoryModeleRepo(data),

    centres: new MemoryCentreRepo(data),

    conducteurs: new MemoryConducteurRepo(data),

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

    contraventions: new MemoryContraventionRepo(data),

    stats: new MemoryStatsRepo(data),
  }
}
