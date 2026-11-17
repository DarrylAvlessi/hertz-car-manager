import { Router } from "express"

import { z } from "zod"

import type { Env } from "../../config/env.js"

import { asyncHandler } from "../../middleware/asyncHandler.js"

import {
  requireAuth,
  requireRole,
  validateBody,
} from "../../middleware/auth.js"

import { badRequest, conflict, notFound } from "../../lib/httpErrors.js"

import {
  normalizeCsvHeader,
  normalizeCsvLookup,
  parseCsvDocument,
} from "../../lib/csv.js"

import type {
  ContraventionInput,
  ContraventionPaiement,
  ContraventionRecouvrement,
  Repositories,
} from "../../repositories/types.js"

const dateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}, "Date invalide")

const contraventionSchema = z

  .object({
    numeroContravention: z.string().trim().min(1).max(40),

    type: z.string().trim().min(1).max(150),

    dateInfraction: dateSchema,

    montant: z.number().finite().min(0),

    frais: z.number().finite().min(0).optional(),

    statutPaiement: z.enum(["IMPAYEE", "PAYEE"]),

    dateReglement: dateSchema.nullable().optional(),

    moyenPaiement: z.string().trim().max(40).nullable().optional(),

    numeroQuittance: z.string().trim().max(60).nullable().optional(),

    payeur: z.enum(["HERTZ", "CLIENT", "AGENT_DE_VENTE"]).nullable().optional(),

    statutRecouvrement: z.enum(["NON_EFFECTUE", "EFFECTUE", "NON_LIEU"]),

    dateRecouvrement: dateSchema.nullable().optional(),

    montantRecouvre: z.number().finite().min(0).optional(),

    fraisRecouvres: z.number().finite().min(0).optional(),

    vehiculeId: z.number().int().positive(),

    clientId: z.number().int().positive().nullable().optional(),

    clientImport: z.string().trim().max(180).nullable().optional(),

    commercialId: z.number().int().positive().nullable().optional(),

    commercialImport: z.string().trim().max(180).nullable().optional(),

    observation: z.string().trim().max(255).nullable().optional(),
  })

  .refine(
    (input) => input.statutPaiement !== "PAYEE" || Boolean(input.dateReglement),

    {
      message:
        "La date de règlement est requise lorsque la contravention est payée.",

      path: ["dateReglement"],
    },
  )

const csvSchema = z.object({
  csv: z.string().min(1).max(5_000_000),
})

const CSV_HEADERS = [
  "N°",

  "Contravention",

  "N° de Contravention",

  "Date",

  "Montant",

  "Imatriculation",

  "Marque",

  "Modèl",

  "Client",

  "Agent de vent",

  "Statut",

  "Date de règlement",

  "Moyent de paiement",

  "N° de quittance",

  "Payeur",

  "Recouvrement",

  "Date du recouvrement",
]

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,

  fevrier: 2,

  mars: 3,

  avril: 4,

  mai: 5,

  juin: 6,

  juillet: 7,

  aout: 8,

  septembre: 9,

  octobre: 10,

  novembre: 11,

  decembre: 12,
}

function parseCsvDate(value: string): string | null {
  const text = value.trim()

  if (!text) return null

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)

  const numeric = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

  let year: number

  let month: number

  let day: number

  if (iso) {
    year = Number(iso[1])

    month = Number(iso[2])

    day = Number(iso[3])
  } else if (numeric) {
    day = Number(numeric[1])

    month = Number(numeric[2])

    year = Number(numeric[3])
  } else {
    const normalized = normalizeCsvLookup(text)

      .toLowerCase()

      .replace(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+/, "")

    const words = normalized.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/)

    if (!words) return null

    day = Number(words[1])

    month = FRENCH_MONTHS[words[2]!] ?? 0

    year = Number(words[3])
  }

  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parseAmount(value: string): number | null {
  const text = value

    .replace(/XOF|FCFA/gi, "")

    .replace(/[\s\u00a0\u202f]/g, "")

    .replace(",", ".")

    .trim()

  if (!text) return null

  const amount = Number(text)

  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

function mapPaymentStatus(value: string): ContraventionPaiement | null {
  const normalized = normalizeCsvLookup(value)

  if (normalized === "PAYEE" || normalized === "PAYE") return "PAYEE"

  if (normalized === "IMPAYEE" || normalized === "IMPAYE") return "IMPAYEE"

  return null
}

function mapRecoveryStatus(value: string): ContraventionRecouvrement | null {
  const normalized = normalizeCsvLookup(value).replace(/[^A-Z0-9]/g, "")

  if (normalized === "EFFECTUE" || normalized === "EFFECTUEE") return "EFFECTUE"

  if (normalized === "NONLIEU") return "NON_LIEU"

  if (normalized === "NONEFFECTUE" || !normalized) return "NON_EFFECTUE"

  return null
}

function mapPaymentMethod(value: string): string | null {
  const normalized = normalizeCsvLookup(value)

  if (!normalized) return null

  if (normalized.includes("MTN")) return "MTN_MOMO"

  if (normalized.includes("MOOV")) return "MOOV_MONEY"

  if (normalized.includes("ESPECE")) return "ESPECES"

  if (normalized.includes("CARTE")) return "CARTE_BANCAIRE"

  if (normalized.includes("CHEQUE")) return "CHEQUE"

  if (normalized.includes("VIREMENT")) return "VIREMENT"

  return "MOBILE_MONEY"
}

function mapPayer(value: string): "HERTZ" | "CLIENT" | "AGENT_DE_VENTE" | null {
  const normalized = normalizeCsvLookup(value)

  if (normalized === "HERTZ") return "HERTZ"

  if (normalized === "CLIENT") return "CLIENT"

  if (normalized.includes("AGENT")) return "AGENT_DE_VENTE"

  return null
}

function hasDatabaseCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  )
}

export function contraventionsRouter(
  repos: Repositories,

  env: Env,
): Router {
  const router = Router()

  const guard = [requireAuth(env.JWT_SECRET)]

  router.get(
    "/",

    guard,

    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === "string" ? req.query.q : undefined

      res.json(await repos.contraventions.list({ q }))
    }),
  )

  router.get(
    "/options",

    guard,

    asyncHandler(async (_req, res) => {
      const [vehicules, clients, commerciaux] = await Promise.all([
        repos.vehicules.list(),

        repos.clients.list(),

        repos.commerciaux.list(),
      ])

      res.json({
        vehicules: vehicules.map((item) => ({
          id: item.id,

          immatriculation: item.immatriculation,

          statut: item.statut,

          vehicule:
            item.marqueModele ??
            `${item.marque ?? ""} ${item.modele ?? ""}`.trim(),
        })),

        clients: clients.map((item) => ({ id: item.id, nom: item.nom })),

        commerciaux: commerciaux.map((item) => ({
          id: item.id,

          nom: item.nom,
        })),
      })
    }),
  )

  router.get(
    "/:id",

    guard,

    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)

      if (!Number.isSafeInteger(id) || id < 1) {
        throw badRequest("Identifiant invalide")
      }

      const row = await repos.contraventions.get(id)

      if (!row) throw notFound("Contravention introuvable")

      res.json(row)
    }),
  )

  router.post(
    "/",

    [
      ...guard,

      requireRole("responsable", "admin"),

      validateBody(contraventionSchema),
    ],

    asyncHandler(async (req, res) => {
      const input = req.body as ContraventionInput

      const [vehicle, client, commercial] = await Promise.all([
        repos.vehicules.get(input.vehiculeId),

        input.clientId ? repos.clients.get(input.clientId) : null,

        input.commercialId ? repos.commerciaux.get(input.commercialId) : null,
      ])

      if (!vehicle) throw notFound("Véhicule introuvable")

      if (input.clientId && !client) throw notFound("Client introuvable")

      if (input.commercialId && !commercial) {
        throw notFound("Commercial introuvable ou désactivé")
      }

      try {
        res.status(201).json(await repos.contraventions.create(input))
      } catch (error) {
        if (hasDatabaseCode(error, "ER_DUP_ENTRY")) {
          throw conflict("Ce numéro de contravention existe déjà.")
        }

        throw error
      }
    }),
  )

  router.put(
    "/:id",

    [
      ...guard,

      requireRole("responsable", "admin"),

      validateBody(contraventionSchema),
    ],

    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)

      if (!Number.isSafeInteger(id) || id < 1)
        throw badRequest("Identifiant invalide")

      const input = req.body as ContraventionInput

      const [vehicle, client, commercial] = await Promise.all([
        repos.vehicules.get(input.vehiculeId),

        input.clientId ? repos.clients.get(input.clientId) : null,

        input.commercialId ? repos.commerciaux.get(input.commercialId) : null,
      ])

      if (!vehicle) throw notFound("Véhicule introuvable")

      if (input.clientId && !client) throw notFound("Client introuvable")

      if (input.commercialId && !commercial) {
        throw notFound("Commercial introuvable ou désactivé")
      }

      try {
        const updated = await repos.contraventions.update(id, input)

        if (!updated) throw notFound("Contravention introuvable")

        res.json(updated)
      } catch (error) {
        if (hasDatabaseCode(error, "ER_DUP_ENTRY")) {
          throw conflict("Ce numéro de contravention existe déjà.")
        }

        throw error
      }
    }),
  )

  router.delete(
    "/:id",

    [...guard, requireRole("responsable", "admin")],

    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)

      if (!Number.isSafeInteger(id) || id < 1)
        throw badRequest("Identifiant invalide")

      try {
        if (!(await repos.contraventions.remove(id))) {
          throw notFound("Contravention introuvable")
        }
      } catch (error) {
        if (
          hasDatabaseCode(error, "ER_ROW_IS_REFERENCED_2") ||
          hasDatabaseCode(error, "ER_ROW_IS_REFERENCED")
        ) {
          throw conflict(
            "Cette contravention est utilisée par un document et ne peut pas être supprimée.",
          )
        }

        throw error
      }

      res.status(204).end()
    }),
  )

  router.post(
    "/import-csv",

    [...guard, requireRole("responsable", "admin"), validateBody(csvSchema)],

    asyncHandler(async (req, res) => {
      let rows: string[][]

      try {
        rows = parseCsvDocument(req.body.csv.replace(/^\uFEFF/, ""))
      } catch (error) {
        throw badRequest(
          error instanceof Error ? error.message : "Fichier CSV invalide",
        )
      }

      const headerIndex = rows.findIndex((row) =>
        row.some((header) => normalizeCsvHeader(header) === "NDECONTRAVENTION"),
      )

      if (headerIndex < 0) {
        throw badRequest(
          "En-tête CSV non reconnu. Utilisez le modèle ANATT du module Contraventions.",
        )
      }

      const headers = rows[headerIndex]!.map(normalizeCsvHeader)

      const requiredHeaders = [
        "CONTRAVENTION",

        "NDECONTRAVENTION",

        "DATE",

        "MONTANT",

        "IMATRICULATION",
      ]

      const missing = requiredHeaders.filter(
        (header) => !headers.includes(header),
      )

      if (missing.length) {
        throw badRequest(`Colonnes manquantes : ${missing.join(", ")}.`)
      }

      const columns = new Map(headers.map((header, index) => [header, index]))

      const value = (row: string[], header: string) =>
        row[columns.get(header) ?? -1]?.trim() ?? ""

      const [vehicles, clients, commercials, existing] = await Promise.all([
        repos.vehicules.list(),

        repos.clients.list(),

        repos.commerciaux.list(),

        repos.contraventions.list(),
      ])

      const normalize = (text: string) => normalizeCsvLookup(text)
      const normalizeRegistration = (text: string) =>
        normalize(text).replace(/[\s-]/g, "")

      const knownNumbers = new Set(
        existing.map((item) => normalize(item.numeroContravention)),
      )

      const inputs: ContraventionInput[] = []

      const errors: string[] = []

      for (let index = headerIndex + 1; index < rows.length; index += 1) {
        const row = rows[index]!

        if (!row.some((cell) => cell.trim())) continue

        const number = value(row, "NDECONTRAVENTION")

        if (!number) continue

        const line = index + 1

        const violation = value(row, "CONTRAVENTION")

        const rawDate = value(row, "DATE")

        const dateInfraction = parseCsvDate(rawDate)

        const amount = parseAmount(value(row, "MONTANT"))

        const registration = value(row, "IMATRICULATION")
        const vehicle = vehicles.find(
          (item) =>
            normalizeRegistration(item.immatriculation) ===
            normalizeRegistration(registration),
        )

        const paidStatus = mapPaymentStatus(value(row, "STATUT"))

        const dateReglementValue = value(row, "DATEDEREGLEMENT")

        const dateReglement = dateReglementValue
          ? parseCsvDate(dateReglementValue)
          : null

        const recoveryValue = value(row, "RECOUVREMENT")

        const recovery = mapRecoveryStatus(recoveryValue)

        const recoveryDateValue = value(row, "DATEDURECOUVREMENT")

        const recoveryDate = recoveryDateValue
          ? parseCsvDate(recoveryDateValue)
          : null

        const clientName = value(row, "CLIENT")

        const commercialName = value(row, "AGENTDEVENT")

        const client = clients.find(
          (item) => normalize(item.nom) === normalize(clientName),
        )

        const commercial = commercials.find(
          (item) => normalize(item.nom) === normalize(commercialName),
        )

        const rowErrors: string[] = []

        if (knownNumbers.has(normalize(number))) {
          rowErrors.push(`numéro de contravention déjà importé (${number})`)
        }

        if (!violation) rowErrors.push("type de contravention manquant")

        if (!dateInfraction) rowErrors.push(`date invalide (${rawDate})`)

        if (amount === null) rowErrors.push("montant invalide")

        if (!vehicle) rowErrors.push(`véhicule introuvable (${registration})`)

        if (!paidStatus) {
          rowErrors.push(
            `statut de paiement non reconnu (${value(row, "STATUT")})`,
          )
        }

        if (paidStatus === "PAYEE" && !dateReglement) {
          rowErrors.push("date de règlement requise ou invalide")
        }

        if (dateReglementValue && !dateReglement) {
          rowErrors.push(`date de règlement invalide (${dateReglementValue})`)
        }

        if (!recovery) {
          rowErrors.push(
            `statut de recouvrement non reconnu (${recoveryValue})`,
          )
        }

        if (recoveryDateValue && !recoveryDate) {
          rowErrors.push(`date de recouvrement invalide (${recoveryDateValue})`)
        }

        if (rowErrors.length) {
          errors.push(`Ligne ${line} : ${rowErrors.join(", ")}.`)

          continue
        }

        knownNumbers.add(normalize(number))

        inputs.push({
          numeroContravention: number,

          type: violation,

          dateInfraction: dateInfraction!,

          montant: amount!,

          statutPaiement: paidStatus!,

          dateReglement,

          moyenPaiement: mapPaymentMethod(value(row, "MOYENTDEPAIEMENT")),

          numeroQuittance: value(row, "NDEQUITTANCE") || null,

          payeur: mapPayer(value(row, "PAYEUR")),

          statutRecouvrement: recovery!,
          dateRecouvrement: recoveryDate,
          montantRecouvre: recovery === "EFFECTUE" ? amount! : 0,
          vehiculeId: vehicle!.id,

          clientId: client?.id ?? null,

          clientImport: client ? null : clientName || null,

          commercialId: commercial?.id ?? null,

          commercialImport: commercial ? null : commercialName || null,
        })
      }

      if (!inputs.length && !errors.length) {
        throw badRequest(
          "Le fichier ne contient aucune contravention à importer.",
        )
      }

      if (errors.length) {
        throw conflict(
          `Import annulé : ${errors.length} erreur(s).\n${errors.slice(0, 40).join("\n")}`,
        )
      }

      try {
        res.status(201).json({
          created: await repos.contraventions.importMany(inputs),
        })
      } catch (error) {
        if (hasDatabaseCode(error, "ER_DUP_ENTRY")) {
          throw conflict(
            "Import annulé : un numéro de contravention existe déjà.",
          )
        }

        throw error
      }
    }),
  )

  return router
}
