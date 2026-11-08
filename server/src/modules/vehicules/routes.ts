import { Router } from "express"

import { z } from "zod"

import { asyncHandler } from "../../middleware/asyncHandler.js"

import { badRequest, conflict, notFound } from "../../lib/httpErrors.js"

import {
  CsvParseError,
  normalizeCsvHeader,
  normalizeCsvLookup,
  parseCsvDocument,
} from "../../lib/csv.js"

import {
  paginationSchema,
  requireAuth,
  requireRole,
  validateBody,
} from "../../middleware/auth.js"

import type { Env } from "../../config/env.js"

import type {
  Repositories,
  VehiculeInput,
  VehiculeStatut,
} from "../../repositories/types.js"

const STATUTS: VehiculeStatut[] = [
  "ENTREE_PARC",

  "MISE_EN_LOCATION",

  "RETOUR_LOCATION",

  "SORTIE_INTERNE",

  "RETOUR_INTERNE",

  "ENVOI_GARAGE",

  "RETOUR_GARAGE",

  "SORTIE_DEFINITIVE",

  "RESERVATION",
]

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_ROW_IS_REFERENCED_2"
  )
}

const STATUTS_SUPPRIMABLES: ReadonlySet<VehiculeStatut> = new Set([
  "ENTREE_PARC",

  "RETOUR_LOCATION",

  "RETOUR_INTERNE",

  "RETOUR_GARAGE",

  "SORTIE_DEFINITIVE",
])

const statutSchema = z
  .object({
    statut: z.enum([
      "ENTREE_PARC",

      "MISE_EN_LOCATION",

      "RETOUR_LOCATION",

      "SORTIE_INTERNE",

      "RETOUR_INTERNE",

      "ENVOI_GARAGE",

      "RETOUR_GARAGE",

      "SORTIE_DEFINITIVE",

      "RESERVATION",
    ]),

    observation: z.string().trim().max(255).optional(),

    kilometrageDepart: z.number().int().min(0).optional(),

    kilometrageRetour: z.number().int().min(0).optional(),

    garageId: z.number().int().positive().optional(),

    typePassage: z
      .enum([
        "REPARATION",
        "REVISION",
        "ENTRETIEN",
        "VISITE_TECHNIQUE",
        "AUTRE",
      ])
      .optional(),

    motif: z.string().trim().max(255).nullable().optional(),

    typeLocation: z.enum(["Courte durée", "Longue durée"]).optional(),

    clientId: z.number().int().positive().optional(),

    commercialId: z.number().int().positive().optional(),

    sortieInterne: z
      .object({
        commercialId: z.number().int().positive(),
        motif: z.string().trim().min(1).max(255),
      })
      .optional(),

    dateDebut: z.string().trim().min(16).max(25).optional(),

    dateFin: z.string().trim().min(16).max(25).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.statut === "MISE_EN_LOCATION") {
      for (const field of [
        "typeLocation",
        "clientId",
        "commercialId",
        "dateDebut",
        "dateFin",
      ] as const) {
        if (value[field] === undefined)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: "Champ requis pour une mise en location",
          })
      }

      if (
        value.dateDebut &&
        value.dateFin &&
        value.dateFin <= value.dateDebut
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateFin"],
          message: "La fin doit être postérieure au début",
        })
      }
    }

    if (value.statut === "ENVOI_GARAGE" && value.commercialId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commercialId"],
        message: "Un commercial responsable est requis pour un envoi au garage",
      })
    }

    if (value.statut === "SORTIE_INTERNE" && value.sortieInterne === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sortieInterne"],
        message: "Le commercial et le motif sont requis pour une sortie interne",
      })
    }
  })

const vehiculeFields = {
  immatriculation: z.string().trim().min(3).max(20),

  marque: z.string().trim().min(2).max(60),

  modele: z.string().trim().min(1).max(80),

  categorieId: z.number().int().positive().nullable().optional(),

  version: z.string().trim().max(60).nullable().optional(),

  annee: z.number().int().min(1900).max(2200).nullable().optional(),

  numeroChassis: z.string().trim().max(40).nullable().optional(),

  couleur: z.string().trim().max(30).nullable().optional(),

  carburant: z
    .enum(["ESSENCE", "DIESEL", "HYBRIDE", "ELECTRIQUE"])
    .nullable()
    .optional(),

  nbPlaces: z.number().int().min(1).max(99).nullable().optional(),

  kilometrage: z.number().int().min(0),

  segmentParc: z.enum(["LCD", "LLD", "LEASING", "IMPRO", "AUTRE"]),

  groupeGeolocalisation: z.string().trim().max(80).nullable().optional(),

  centreId: z.number().int().positive().nullable().optional(),

  dateMiseEnService: z.string().date().nullable().optional(),

  dateEntreeParc: z.string().date().nullable().optional(),

  prixAchat: z.number().finite().min(0).nullable().optional(),

  dateAchat: z.string().date().nullable().optional(),

  dateProchaineVisiteTechnique: z.string().date().nullable().optional(),

  dateExpirationAssurance: z.string().date().nullable().optional(),

  observation: z.string().trim().max(255).nullable().optional(),
}

const vehiculeSchema = z.object(vehiculeFields).superRefine((value, ctx) => {
  if (
    value.dateEntreeParc &&
    value.dateMiseEnService &&
    value.dateMiseEnService < value.dateEntreeParc
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateMiseEnService"],
      message: "La mise en service ne peut pas précéder l'entrée au parc",
    })
  }
})

const vehiculePatchSchema = z.object(vehiculeFields).partial()

const venteDateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/,
    "Date de vente invalide",
  )

const venteSchema = z.object({
  numeroVente: z.string().trim().min(1).max(30),

  vehiculeId: z.number().int().positive(),

  acheteurId: z.number().int().positive(),

  dateVente: venteDateSchema,

  prixVente: z.number().finite().min(0),

  devise: z.string().trim().length(3).default("XOF"),

  fraisVente: z.number().finite().min(0).default(0),

  motifVente: z.enum([
    "RENOUVELLEMENT_PARC",
    "COUT_ENTRETIEN_ELEVE",
    "FIN_CONTRAT",
    "ACCIDENT",
    "BESOIN_TRESORERIE",
    "AUTRE",
  ]),

  etatVehicule: z.enum([
    "BON",
    "MOYEN",
    "MAUVAIS",
    "ACCIDENTE",
    "EPAVE",
    "POUR_PIECES",
  ]),

  kilometrageVente: z.number().int().min(0),

  canalVente: z
    .enum([
      "PARTICULIER",
      "GARAGE_PROFESSIONNEL",
      "ENCHERES",
      "CLIENT_LOCATION",
      "APPEL_OFFRES",
      "AUTRE",
    ])
    .nullable()
    .optional(),

  statutPaiement: z
    .enum(["NON_PAYEE", "PARTIELLE", "PAYEE"])
    .default("NON_PAYEE"),

  dateRemiseVehicule: venteDateSchema.nullable().optional(),

  referenceCession: z.string().trim().max(60).nullable().optional(),

  factureId: z.number().int().positive().nullable().optional(),

  commercialId: z.number().int().positive().nullable().optional(),

  observation: z.string().trim().max(255).nullable().optional(),
})

const dispoSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ"),

  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ"),
})

const VEHICLE_CSV_HEADERS = [
  "Immatriculation",

  "VIN",

  "Marque",

  "Modele",

  "Carburation",

  "Client",

  "Kilometrage",

  "Observations particulieres",

  "Date de mise en service",

  "Prochaine visite technique",

  "Expiration assurance",
]

const vehicleCsvSchema = z.object({
  csv: z.string().min(1).max(1_000_000),
})

function parseCsvDate(value: string): string | null {
  const trimmed = value.trim()

  if (!trimmed) return null

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)

  const year = match ? Number(match[3]) : isoMatch ? Number(isoMatch[1]) : NaN

  const month = match ? Number(match[2]) : isoMatch ? Number(isoMatch[2]) : NaN

  const day = match ? Number(match[1]) : isoMatch ? Number(isoMatch[3]) : NaN

  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("date invalide (attendu J/M/AAAA ou JJ/MM/AAAA)")
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parseCsvFuel(value: string): VehiculeInput["carburant"] {
  const normalized = normalizeCsvLookup(value)
    .replace(/\s+/g, " ")
    .replace(/\s*\([^)]*\)\s*$/, "")

  if (!normalized || normalized === "INDEFINI") return null

  if (normalized === "ES" || normalized === "ESSENCE")
    return "ESSENCE"

  if (normalized === "GO" || normalized === "DIESEL")
    return "DIESEL"

  if (normalized === "HYBRIDE") return "HYBRIDE"

  if (normalized === "ELECTRIQUE") return "ELECTRIQUE"

  throw new Error("carburation inconnue")
}

function resolveCsvModel(
  marque: string,

  modelValue: string,

  models: Awaited<ReturnType<Repositories["modeles"]["list"]>>,
): {
  marque: string
  modele: string
  version: string | null
  categorieId: number | null
} | null {
  const normalizedMarque = normalizeCsvLookup(marque)

  const normalizedModel = normalizeCsvLookup(modelValue)

  const matchingModels = models

    .filter((model) => normalizeCsvLookup(model.marque) === normalizedMarque)

    .sort((left, right) => right.nom.length - left.nom.length)

  const exact = matchingModels.find(
    (model) => normalizeCsvLookup(model.nom) === normalizedModel,
  )

  if (exact) {
    return {
      marque: exact.marque,
      modele: exact.nom,
      version: null,
      categorieId: exact.categorieId,
    }
  }

  const normalizedModelWords = normalizedModel.split(/\s+/).sort().join(" ")

  const reorderedExact = matchingModels.find(
    (model) =>
      normalizeCsvLookup(model.nom).split(/\s+/).sort().join(" ") ===
      normalizedModelWords,
  )

  if (reorderedExact) {
    return {
      marque: reorderedExact.marque,

      modele: reorderedExact.nom,

      version: null,

      categorieId: reorderedExact.categorieId,
    }
  }

  for (const model of matchingModels) {
    const prefix = normalizeCsvLookup(model.nom)

    if (
      normalizedModel.startsWith(`${prefix} `) ||
      normalizedModel.startsWith(`${prefix}-`)
    ) {
      const version = modelValue
        .slice(model.nom.length)
        .replace(/^[\s-]+/, "")
        .trim()

      if (version)
        return {
          marque: model.marque,
          modele: model.nom,
          version,
          categorieId: model.categorieId,
        }
    }
  }

  return null
}

function parseVehicleCsv(
  csv: string,

  centers: Awaited<ReturnType<Repositories["centres"]["list"]>>,

  models: Awaited<ReturnType<Repositories["modeles"]["list"]>>,
): VehiculeInput[] {
  let rows: string[][]

  try {
    rows = parseCsvDocument(csv.replace(/^\uFEFF/, ""))
  } catch (error) {
    if (error instanceof CsvParseError) throw badRequest(error.message)

    throw error
  }

  const rawHeaders = rows[0]?.map((header) =>
    header.trim().replace(/^\uFEFF/, ""),
  )

  const hasLegacyTrailingColumn = rawHeaders?.at(-1) === ""

  const headers = hasLegacyTrailingColumn ? rawHeaders.slice(0, -1) : rawHeaders

  const hasLegacyNumberColumn = headers?.[0] === "#"

  const normalizedHeaders = hasLegacyNumberColumn ? headers.slice(1) : headers

  if (
    !normalizedHeaders ||
    normalizedHeaders.length !== VEHICLE_CSV_HEADERS.length ||
    VEHICLE_CSV_HEADERS.some(
      (header, index) =>
        normalizeCsvHeader(normalizedHeaders[index] ?? "") !==
        normalizeCsvHeader(header),
    )
  ) {
    const received =
      rawHeaders?.map((header) => header || "(vide)").join(" | ") ?? "(aucun)"

    throw badRequest(
      `En-têtes CSV non reconnus. Colonnes lues : ${received}. Téléchargez le modèle depuis le module Véhicules.`,
    )
  }

  const dataRows = rows

    .slice(1)

    .map((values, index) => ({
      values: hasLegacyNumberColumn
        ? values.slice(1, hasLegacyTrailingColumn ? -1 : undefined)
        : hasLegacyTrailingColumn
          ? values.slice(0, -1)
          : values,

      line: index + 2,
    }))

    .filter(({ values }) => values.some((value) => value.trim() !== ""))

    .filter(({ values }) => {
      return !normalizeCsvLookup(values[0] ?? "").startsWith("EXEMPLE")
    })

  if (dataRows.length === 0) {
    throw badRequest(
      "Le fichier ne contient aucun véhicule à importer. Remplacez les lignes dont l’immatriculation commence par « EXEMPLE ».",
    )
  }

  if (dataRows.length > 500)
    throw badRequest("L’import est limité à 500 véhicules par fichier.")

  const errors: string[] = []

  const inputs: VehiculeInput[] = []

  const seenImmatriculations = new Set<string>()

  const seenVins = new Set<string>()

  const centersByName = new Map(
    centers.map((center) => [normalizeCsvLookup(center.nom), center]),
  )

  dataRows.forEach(({ values, line }) => {
    if (values.length !== VEHICLE_CSV_HEADERS.length) {
      errors.push(
        `Ligne ${line} : ${VEHICLE_CSV_HEADERS.length} colonnes attendues, ${values.length} reçues.`,
      )

      return
    }

    const immatriculation = values[0]!.trim()

    const vin = values[1]!.trim()

    const rawMarque = values[2]!.trim()

    const rawModele = values[3]!.trim()

    const observation = values[7]!.trim()

    const rowErrors: string[] = []

    if (!immatriculation) rowErrors.push("immatriculation obligatoire")

    if (immatriculation.length > 20)
      rowErrors.push("immatriculation limitée à 20 caractères")

    if (!rawMarque) rowErrors.push("marque obligatoire")

    if (rawMarque.length > 60) rowErrors.push("marque limitée à 60 caractères")

    if (!rawModele) rowErrors.push("modèle obligatoire")

    if (vin.length > 40) rowErrors.push("VIN limité à 40 caractères")

    if (observation.length > 255)
      rowErrors.push("observation limitée à 255 caractères")

    const normalizedImmatriculation = immatriculation
      .replace(/[\s-]/g, "")
      .toUpperCase()

    if (
      normalizedImmatriculation &&
      seenImmatriculations.has(normalizedImmatriculation)
    ) {
      rowErrors.push("immatriculation déjà présente dans le fichier")
    }

    if (normalizedImmatriculation)
      seenImmatriculations.add(normalizedImmatriculation)

    const normalizedVin = vin.toUpperCase()

    if (normalizedVin && seenVins.has(normalizedVin))
      rowErrors.push("VIN déjà présent dans le fichier")

    if (normalizedVin) seenVins.add(normalizedVin)

    const centerName = values[5]!.trim()

    const center = centerName
      ? centersByName.get(normalizeCsvLookup(centerName))
      : undefined

    if (centerName && !center)
      rowErrors.push(`centre « ${centerName} » introuvable`)

    const model =
      rawMarque && rawModele
        ? resolveCsvModel(rawMarque, rawModele, models)
        : null

    if (rawMarque && rawModele && !model)
      rowErrors.push(`modèle « ${rawMarque} ${rawModele} » absent du catalogue`)

    const mileageValue = values[6]!.trim().replace(/\s/g, "")

    const mileage = /^\d+$/.test(mileageValue) ? Number(mileageValue) : NaN

    if (!Number.isSafeInteger(mileage) || mileage < 0)
      rowErrors.push("kilométrage invalide")

    let carburant: VehiculeInput["carburant"] = null

    let dateMiseEnService: string | null = null

    let dateProchaineVisiteTechnique: string | null = null

    let dateExpirationAssurance: string | null = null

    try {
      carburant = parseCsvFuel(values[4]!)
    } catch (error) {
      rowErrors.push(
        error instanceof Error ? error.message : "carburation invalide",
      )
    }

    try {
      dateMiseEnService = parseCsvDate(values[8]!)
    } catch (error) {
      rowErrors.push(
        `date de mise en service : ${
          error instanceof Error ? error.message : "date invalide"
        }`,
      )
    }

    try {
      dateProchaineVisiteTechnique = parseCsvDate(values[9]!)
    } catch (error) {
      rowErrors.push(
        `prochaine visite technique : ${
          error instanceof Error ? error.message : "date invalide"
        }`,
      )
    }

    try {
      dateExpirationAssurance = parseCsvDate(values[10]!)
    } catch (error) {
      rowErrors.push(
        `expiration assurance : ${
          error instanceof Error ? error.message : "date invalide"
        }`,
      )
    }

    if (rowErrors.length > 0 || !model || !Number.isSafeInteger(mileage)) {
      errors.push(`Ligne ${line} : ${rowErrors.join(", ")}.`)

      return
    }

    const input: VehiculeInput = {
      immatriculation,

      marque: model.marque,

      modele: model.modele,

      version: model.version,

      numeroChassis: vin || null,

      carburant,

      kilometrage: mileage,

      segmentParc: "LCD",

      centreId: center?.id ?? null,

      dateMiseEnService,

      dateProchaineVisiteTechnique,

      dateExpirationAssurance,

      observation: observation || null,

      categorieId: model.categorieId,
    }

    const parsed = vehiculeSchema.safeParse(input)

    if (!parsed.success) {
      errors.push(
        `Ligne ${line} : ${parsed.error.issues.map((issue) => issue.message).join(", ")}.`,
      )

      return
    }

    inputs.push(parsed.data)
  })

  if (errors.length > 0) {
    throw badRequest(
      `Import annulé : ${errors.length} erreur(s).\n${errors.slice(0, 20).join("\n")}`,

      errors,
    )
  }

  return inputs
}

export function vehiculesRouter(repos: Repositories, env: Env): Router {
  const router = Router()

  const guard = [
    requireAuth(env.JWT_SECRET),
    requireRole("responsable", "admin"),
  ]

  router.get(
    "/",

    guard,

    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)

      res.json(await repos.vehicules.list({ q, limit }))
    }),
  )

  router.post(
    "/import-csv",

    [...guard, validateBody(vehicleCsvSchema)],

    asyncHandler(async (req, res) => {
      const [centers, models, existingVehicles] = await Promise.all([
        repos.centres.list(),

        repos.modeles.list(),

        repos.vehicules.list(),
      ])

      const inputs = parseVehicleCsv(req.body.csv, centers, models)

      const existingByImmatriculation = new Map(
        existingVehicles.map((vehicle) => [
          vehicle.immatriculation.trim().replace(/[\s-]/g, "").toUpperCase(),

          vehicle,
        ]),
      )

      const existingByVin = new Map(
        existingVehicles

          .filter((vehicle) => vehicle.numeroChassis)

          .map((vehicle) => [
            vehicle.numeroChassis!.trim().toUpperCase(),
            vehicle,
          ]),
      )

      const vinConflicts = inputs.flatMap((input, index) => {
        const vinVehicle = input.numeroChassis
          ? existingByVin.get(input.numeroChassis.trim().toUpperCase())
          : undefined

        const targetVehicle = existingByImmatriculation.get(
          input.immatriculation.trim().replace(/[\s-]/g, "").toUpperCase(),
        )

        return vinVehicle && vinVehicle.id !== targetVehicle?.id
          ? [
              `Ligne ${index + 2} : le VIN est déjà associé à ${vinVehicle.immatriculation}.`,
            ]
          : []
      })

      if (vinConflicts.length > 0) {
        throw badRequest(
          `Import annulé : ${vinConflicts.join(" ")}`,
          vinConflicts,
        )
      }

      try {
        res
          .status(200)
          .json(await repos.vehicules.importMany(inputs, req.user!.id))
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ER_DUP_ENTRY"
        ) {
          throw conflict(
            "Import annulé : un VIN ou une immatriculation est déjà utilisé par un autre véhicule.",
          )
        }

        throw error
      }
    }),
  )

  router.get(
    "/ventes",

    guard,

    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)

      res.json(await repos.ventesVehicules.list({ q, limit }))
    }),
  )

  router.post(
    "/ventes",

    [...guard, validateBody(venteSchema)],

    asyncHandler(async (req, res) => {
      const vehicle = await repos.vehicules.get(req.body.vehiculeId)

      if (!vehicle) throw notFound("Véhicule introuvable")

      if (vehicle.statut === "SORTIE_DEFINITIVE")
        throw conflict("Ce véhicule est déjà sorti définitivement")

      if (!(await repos.clients.get(req.body.acheteurId)))
        throw notFound("Acheteur introuvable")

      if (
        req.body.commercialId &&
        !(await repos.commerciaux.get(req.body.commercialId))
      )

        throw notFound("Commercial introuvable")

      const sales = await repos.ventesVehicules.list()

      if (sales.some((sale) => sale.numeroVente === req.body.numeroVente))
        throw conflict("Ce numéro de vente existe déjà")

      res
        .status(201)
        .json(await repos.ventesVehicules.create(req.body, req.user!.id))
    }),
  )

  router.delete(
    "/ventes/:id",
    guard,
    asyncHandler(async (req, res) => {
      if (!(await repos.ventesVehicules.remove(Number(req.params.id)))) {
        throw notFound("Vente introuvable")
      }
      res.status(204).end()
    }),
  )

  router.post(
    "/:id/statut",

    [...guard, validateBody(statutSchema)],

    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)

      const vehicle = await repos.vehicules.get(id)

      if (!vehicle) throw notFound("Véhicule introuvable")

      if (vehicle.statut === "SORTIE_DEFINITIVE")
        throw conflict(
          "Un véhicule sorti définitivement ne peut plus changer de statut",
        )

      if (
        req.body.statut === "ENVOI_GARAGE" &&
        req.body.garageId !== undefined &&
        !(await repos.garages.get(req.body.garageId))
      ) {
        throw notFound("Garage introuvable")
      }

      if (req.body.sortieInterne) {
        if (!(await repos.commerciaux.get(req.body.sortieInterne.commercialId))) {
          throw notFound("Commercial introuvable")
        }
      }

      if (req.body.statut === "MISE_EN_LOCATION") {
        if (!(await repos.clients.get(req.body.clientId)))
          throw notFound("Client introuvable")

        if (!(await repos.commerciaux.get(req.body.commercialId)))
          throw notFound("Commercial introuvable")
      }

      if (
        req.body.statut === "ENVOI_GARAGE" &&
        !(await repos.commerciaux.get(req.body.commercialId))
      ) {
        throw notFound("Commercial introuvable")
      }

      const movement = await repos.mouvements.changeVehicleStatus({
        vehiculeId: id,

        statut: req.body.statut,

        kilometrage:
          req.body.kilometrageDepart ??
          req.body.kilometrageRetour ??
          vehicle.kilometrage,

        observation:
          req.body.observation ?? `Statut changé vers ${req.body.statut}`,

        garageId: req.body.garageId,

        typePassage: req.body.typePassage,

        motif: req.body.motif,

        typeLocation: req.body.typeLocation,

        clientId: req.body.clientId,

        commercialId: req.body.commercialId,

        validateurId:
          req.body.statut === "ENVOI_GARAGE"
            ? req.body.commercialId
            : undefined,

        dateDebut: req.body.dateDebut,

        dateFin: req.body.dateFin,

        sortieInterne: req.body.sortieInterne,
      })

      const updated = await repos.vehicules.get(id)

      res.json({ vehicle: updated, movement })
    }),
  )

  router.get(
    "/:id",

    guard,

    asyncHandler(async (req, res) => {
      const row = await repos.vehicules.get(Number(req.params.id))

      if (!row) throw notFound("Véhicule introuvable")

      res.json(row)
    }),
  )

  // Règle métier (réutilisée par le tunnel Prince) : un véhicule est disponible

  // s'il n'est ni en entretien/garage, ni couvert par une location active ou une

  // réservation confirmée/en attente sur la période demandée.

  router.get(
    "/:id/disponibilite",

    guard,

    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)

      const { from, to } = dispoSchema.parse(req.query)

      if (from > to) throw badRequest("Période invalide : fin avant début")

      const vehicule = await repos.vehicules.get(id)

      if (!vehicule) throw notFound("Véhicule introuvable")

      if (vehicule.statut === "ENVOI_GARAGE") {
        const garage = await repos.maintenances.openForVehicule(id)

        res.json({
          disponible: false,

          motif: garage
            ? `Au garage depuis le ${garage.dateEntree} (${garage.motif})`
            : `Statut : ${vehicule.statut}`,
        })

        return
      }

      const conflitsLocations = await repos.locations.overlapping(id, from, to)

      if (conflitsLocations.length > 0) {
        res.json({
          disponible: false,

          motif: `Déjà en location (${conflitsLocations[0]!.reference}) sur la période`,
        })

        return
      }

      const conflitsResas = await repos.reservations.overlapping(id, from, to)

      if (conflitsResas.length > 0) {
        res.json({
          disponible: false,

          motif: `Déjà réservé (${conflitsResas[0]!.reference}) sur la période`,
        })

        return
      }

      res.json({ disponible: true, motif: null })
    }),
  )

  router.post(
    "/",

    [...guard, validateBody(vehiculeSchema)],

    asyncHandler(async (req, res) => {
      const exists = await repos.vehicules.findByImmatriculation(
        req.body.immatriculation,
      )

      if (exists) throw conflict("Immatriculation déjà enregistrée")

      if (
        !(await repos.modeles.list()).some(
          (m) => m.marque === req.body.marque && m.nom === req.body.modele,
        )
      ) {
        throw notFound(
          "Modèle introuvable : ajoutez d’abord ce modèle au référentiel",
        )
      }

      if (
        req.body.categorieId !== undefined &&
        req.body.categorieId !== null &&
        !(await repos.categories.get(req.body.categorieId))
      ) {
        throw notFound("Catégorie introuvable")
      }

      const created = await repos.vehicules.create(req.body, req.user!.id)

      await repos.mouvements.createEntry({
        vehiculeId: created.id,

        date: req.body.dateEntreeParc ?? new Date().toISOString().slice(0, 10),

        kilometrage: req.body.kilometrage,

        observation: req.body.observation ?? null,
      })

      res.status(201).json(created)
    }),
  )

  router.put(
    "/:id",

    [...guard, validateBody(vehiculePatchSchema)],

    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)

      if (req.body.immatriculation) {
        const exists = await repos.vehicules.findByImmatriculation(
          req.body.immatriculation,
        )

        if (exists && exists.id !== id)
          throw conflict("Immatriculation déjà enregistrée")
      }

      const current = await repos.vehicules.get(id)

      if (!current) throw notFound("Véhicule introuvable")

      if (current.statut === "SORTIE_DEFINITIVE")
        throw conflict(
          "Un véhicule sorti définitivement ne peut plus être modifié",
        )

      const marque = req.body.marque ?? current.marque

      const modele = req.body.modele ?? current.modele

      if (
        marque &&
        modele &&
        !(await repos.modeles.list()).some(
          (m) => m.marque === marque && m.nom === modele,
        )
      ) {
        throw notFound("Modèle introuvable")
      }

      if (
        req.body.categorieId !== undefined &&
        !(await repos.categories.get(req.body.categorieId))
      ) {
        throw notFound("Catégorie introuvable")
      }

      const updated = await repos.vehicules.update(id, req.body)

      if (!updated) throw notFound("Véhicule introuvable")

      res.json(updated)
    }),
  )

  router.delete(
    "/:id",

    guard,

    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)

      const vehicule = await repos.vehicules.get(id)

      if (!vehicule) throw notFound("Véhicule introuvable")

      if (!STATUTS_SUPPRIMABLES.has(vehicule.statut)) {
        throw conflict(
          "Suppression autorisée uniquement pour les véhicules en entrée au parc, de retour de location, de retour interne, de retour du garage ou sortis définitivement",
        )
      }

      let removed: boolean

      try {
        removed = await repos.vehicules.remove(id)
      } catch (error) {
        if (isForeignKeyConstraintError(error)) {
          throw conflict(
            "Ce véhicule est encore référencé dans l'historique et ne peut pas être supprimé",
          )
        }

        throw error
      }

      if (!removed) throw notFound("Véhicule introuvable")

      res.status(204).end()
    }),
  )

  return router
}

export { STATUTS }
