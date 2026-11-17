import { Router } from "express"

import { z } from "zod"

import { asyncHandler } from "../../middleware/asyncHandler.js"

import { badRequest, conflict, notFound } from "../../lib/httpErrors.js"

import {
  paginationSchema,
  requireAuth,
  requireRole,
  validateBody,
} from "../../middleware/auth.js"

import type { Env } from "../../config/env.js"

import type { Repositories } from "../../repositories/types.js"

import {
  AvailabilityConflictError,
  ReservationInUseError,
  ReservationStatusConflictError,
} from "../../repositories/helpers.js"

import {
  CsvParseError,
  normalizeCsvHeader,
  normalizeCsvLookup,
  normalizeCsvName,
  parseCsvDate,
  parseCsvDocument,
} from "../../lib/csv.js"

import type {
  CommercialInput,
  LocationInput,
  ReservationImportInput,
  ReservationUpdateInput,
} from "../../repositories/types.js"
import { canStartVehicleOperation } from "../vehicules/statusRules.js"

const clientSchema = z.object({
  nom: z.string().trim().min(1).max(150),

  prenom: z.string().trim().max(80).optional(),

  type: z
    .enum(["Particulier", "Entreprise", "Organisation"])
    .default("Particulier"),

  telephone: z.string().trim().max(30).optional(),

  email: z
    .union([z.string().trim().email().max(120), z.literal("")])
    .optional(),

  adresse: z.string().trim().max(255).optional(),

  numPermis: z.string().trim().max(50).optional(),
})

const commercialSchema = z.object({
  nom: z.string().trim().min(1).max(80),

  prenom: z.string().trim().max(80).optional(),

  abreviation: z.string().trim().max(10).optional(),

  telephone: z.string().trim().max(30).optional(),

  email: z
    .union([z.string().trim().email().max(120), z.literal("")])
    .optional(),

  agenceId: z.number().int().positive().nullable().optional(),
})

const commercialCsvSchema = z.object({
  csv: z.string().min(1).max(1_000_000),
})

const locationCsvSchema = z.object({
  csv: z.string().min(1).max(1_000_000),
})

const locationImportSchema = locationCsvSchema.extend({
  sousLocationImmatriculations: z
    .array(z.string().trim().min(1).max(30))
    .max(500)
    .default([]),
})

const sousLocationVehicleSchema = z.object({
  immatriculation: z.string().trim().min(1).max(30),
  marque: z.string().trim().max(60).nullable().optional(),
  modele: z.string().trim().max(80).nullable().optional(),
  version: z.string().trim().max(60).nullable().optional(),
  annee: z.number().int().min(1900).max(2200).nullable().optional(),
  numeroChassis: z.string().trim().max(40).nullable().optional(),
  couleur: z.string().trim().max(30).nullable().optional(),
  carburant: z
    .enum(["ESSENCE", "DIESEL", "HYBRIDE", "ELECTRIQUE"])
    .nullable()
    .optional(),
  nbPlaces: z.number().int().min(1).max(30).nullable().optional(),
  kilometrage: z.number().int().min(0).optional(),
  segmentParc: z.enum(["LCD", "LLD", "LEASING", "IMPRO", "AUTRE"]).optional(),
  groupeGeolocalisation: z.string().trim().max(80).nullable().optional(),
  centreId: z.number().int().positive().nullable().optional(),
  dateMiseEnService: z.string().trim().max(25).nullable().optional(),
  dateEntreeParc: z.string().trim().max(25).nullable().optional(),
  dateSortieParc: z.string().trim().max(25).nullable().optional(),
  prixAchat: z.number().min(0).nullable().optional(),
  dateAchat: z.string().trim().max(25).nullable().optional(),
  prixVente: z.number().min(0).nullable().optional(),
  dateProchaineVisiteTechnique: z.string().trim().max(25).nullable().optional(),
  dateExpirationAssurance: z.string().trim().max(25).nullable().optional(),
  observation: z.string().trim().max(255).nullable().optional(),
  categorieId: z.number().int().positive().nullable().optional(),
})

const reservationStatusSchema = z.object({
  status: z.enum(["À venir", "En cours", "Terminée", "Annulée"]),
})

const COMMERCIAL_CSV_HEADERS = [
  "PRENOM",
  "NOM",
  "ABREVIATIONS",
  "AGENCE",
  "CODEAGENCE",
  "TELEPHONE",
  "EMAIL",
]

const COMMERCIAL_FULLNAME_CSV_HEADERS = [
  "NOMETPRENOMS",
  "ABREVIATIONS",
  "AGENCE",
  "CODEAGENCE",
  "TELEPHONE",
  "EMAIL",
]

const LOCATION_CSV_HEADERS = [
  "Nom du client",
  "Immat. Véhicule",
  "Début",
  "Fin",
  "Durée",
  "Mode de paiement",
  "Réf. Facture",
  "Date facturation",
  "Montant",
  "PAYE",
  "Date de paiement",
  "Commercial",
  "Observation",
]

const RESERVATION_CSV_HEADERS = [
  "Immatriculation",
  "Véhicule",
  "Agent de vente",
  "Date de Résa",
  "Date de début",
  "Date prévu de retour",
  "Durée (j)",
  "Mission",
  "Lieu de la mission",
  "Client",
  "Statut de confirmation",
  "Statut de la résa",
  "Statut de la facturation",
]

function parseLocationCsvTime(value: string, endOfDay = false): string | null {
  const text = value
    .normalize("NFKC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim()
  if (!text) return endOfDay ? "23:59:59" : "00:00:00"

  if (/^(?:0(?:\.\d+)?|0?\.\d+)$/.test(text)) {
    const serial = Number(text)
    const seconds = Math.min(86_399, Math.round(serial * 86_400))
    const hour = Math.floor(seconds / 3_600)
    const minute = Math.floor((seconds % 3_600) / 60)
    const second = seconds % 60
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`
  }

  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] ?? "0")
  const meridiem = match[4]?.toUpperCase()

  if (
    minute > 59 ||
    second > 59 ||
    (meridiem ? hour < 1 || hour > 12 : hour > 23)
  ) {
    return null
  }
  if (meridiem) hour = (hour % 12) + (meridiem === "PM" ? 12 : 0)

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`
}

function parseLocationCsvStatus(
  value: string,
): NonNullable<LocationInput["statut"]> | null {
  const status = normalizeCsvLookup(value).replace(/[^A-Z0-9]/g, "")
  if (!status) return "EN_COURS"

  const statuses: Record<string, NonNullable<LocationInput["statut"]>> = {
    ENCOURS: "EN_COURS",
    TERMINE: "TERMINEE",
    TERMINEE: "TERMINEE",
    RETOURNE: "TERMINEE",
    RETOURNEE: "TERMINEE",
    ENRETARD: "EN_RETARD",
    ENPROLONGATION: "EN_PROLONGATION",
  }

  return statuses[status] ?? null
}

function parseLocationCsvAmount(value: string): number | null {
  const text = value.trim().replace(/[\s\u00a0\u202f]/g, "")
  if (!text) return 0

  let normalized = text
  if (text.includes(",")) {
    if (!/^\d{1,3}(?:[.]\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(text)) {
      return null
    }
    normalized = text.replace(/\./g, "").replace(",", ".")
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, "")
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    return null
  }

  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

function clientNameKey(name: string): string {
  return normalizeCsvName(name)
}

type ParsedLocationCsvRow = Omit<LocationInput, "clientId" | "vehiculeId"> & {
  clientId: number | null
  clientName: string
  vehiculeId: number | null
  immatriculation: string
  line: number
}

function parseLocationCsv(
  csv: string,
  clients: Awaited<ReturnType<Repositories["clients"]["fiches"]>>,
  vehicles: Awaited<ReturnType<Repositories["vehicules"]["list"]>>,
  commercials: Awaited<ReturnType<Repositories["commerciaux"]["fiches"]>>,
): ParsedLocationCsvRow[] {
  let rows: string[][]

  try {
    rows = parseCsvDocument(csv.replace(/^\uFEFF/, ""))
  } catch (error) {
    if (error instanceof CsvParseError) throw badRequest(error.message)
    throw error
  }

  const headerIndex = rows.findIndex((row) => {
    const headers = row.map((value) => normalizeCsvHeader(value))
    return (
      headers.includes("NOMDUCLIENT") &&
      headers.includes("IMMATVEHICULE") &&
      headers.includes("DEBUT") &&
      headers.includes("FIN")
    )
  })

  if (headerIndex < 0) {
    throw badRequest(
      "En-têtes CSV non reconnus. Téléchargez le modèle depuis le module Locations.",
    )
  }

  const headerKeys = rows[headerIndex]!.map((value) =>
    normalizeCsvHeader(value),
  )
  const indexes = new Map(headerKeys.map((key, index) => [key, index]))
  const missingHeaders = LOCATION_CSV_HEADERS.filter(
    (header) => !indexes.has(normalizeCsvHeader(header)),
  )
  if (missingHeaders.length > 0) {
    throw badRequest(
      `Colonnes manquantes : ${missingHeaders.join(", ")}. Téléchargez le modèle depuis le module Locations.`,
    )
  }
  const get = (values: string[], key: string) =>
    values[indexes.get(key) ?? -1]?.trim() ?? ""
  const rowsWithLine = rows
    .slice(headerIndex + 1)
    .map((values, index) => ({ values, line: headerIndex + index + 2 }))
    .filter(({ values }) => values.some((value) => value.trim() !== ""))
    .filter(
      ({ values }) =>
        !normalizeCsvLookup(get(values, "NOMDUCLIENT")).startsWith("EXEMPLE"),
    )
  if (rowsWithLine.length === 0) {
    throw badRequest("Le fichier ne contient aucune location à importer.")
  }
  if (rowsWithLine.length > 500) {
    throw badRequest("L’import est limité à 500 locations par fichier.")
  }

  const clientsByName = new Map<string, number>()
  const addClientName = (name: string, clientId: number) => {
    const key = clientNameKey(name)
    if (key) clientsByName.set(key, clientId)
  }
  for (const client of clients) {
    addClientName(client.nom, client.id)
    if (client.prenom && client.nomFamille) {
      addClientName(`${client.prenom} ${client.nomFamille}`, client.id)
      addClientName(`${client.nomFamille} ${client.prenom}`, client.id)
    }
  }
  const vehiclesByRegistration = new Map(
    vehicles.map((vehicle) => [
      vehicle.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase(),
      vehicle,
    ]),
  )
  const commercialsByName = new Map<string, number>()
  for (const commercial of commercials) {
    if (commercial.actif === false) continue
    if (commercial.abreviation) {
      commercialsByName.set(
        normalizeCsvLookup(commercial.abreviation),
        commercial.id,
      )
    }
    commercialsByName.set(normalizeCsvLookup(commercial.nom), commercial.id)
  }

  const errors: string[] = []
  const inputs: ParsedLocationCsvRow[] = []
  const importedVehicles = new Map<string, Array<{
    debut: string
    fin: string
    line: number
  }>>()
  for (const { values, line } of rowsWithLine) {
    const rowErrors: string[] = []
    const clientName = get(values, "NOMDUCLIENT")
    const registration = get(values, "IMMATVEHICULE")
    const rawStartDate = get(values, "DEBUT")
    const rawStartTime =
      get(values, "HEUREDEDEPART") || get(values, "HEUREDEPART")
    const rawEndDate = get(values, "FIN")
    const rawEndTime =
      get(values, "HEUREDERETOUR") || get(values, "HEURERETOUR")
    const clientId = clientsByName.get(clientNameKey(clientName))
    const vehicle = vehiclesByRegistration.get(
      registration.replace(/[^a-z0-9]/gi, "").toUpperCase(),
    )
    const normalizedRegistration = registration
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
    const startDate = parseCsvDate(rawStartDate)
    const startTime = parseLocationCsvTime(rawStartTime)
    const endDate = parseCsvDate(rawEndDate)
    const endTime = parseLocationCsvTime(rawEndTime, true)
    const start =
      startDate && startTime ? `${startDate.slice(0, 10)}T${startTime}` : null
    const end = endDate && endTime ? `${endDate.slice(0, 10)}T${endTime}` : null
    const rawAmount = get(values, "MONTANT")
    const amount = parseLocationCsvAmount(rawAmount)
    const modePaiement = get(values, "MODEDEPAIEMENT")
    const referenceFacture = get(values, "REFFACTURE")
    const rawInvoiceDate = get(values, "DATEFACTURATION")
    const invoiceDate = rawInvoiceDate
      ? (parseCsvDate(rawInvoiceDate)?.slice(0, 10) ?? null)
      : null
    const rawPaymentDate = get(values, "DATEDEPAIEMENT")
    const paymentDate = rawPaymentDate
      ? (parseCsvDate(rawPaymentDate)?.slice(0, 10) ?? null)
      : null
    const rawPaid = normalizeCsvLookup(get(values, "PAYE"))
    const paid =
      rawPaid === "OUI" || rawPaid === "YES"
        ? true
        : rawPaid === "NON" || rawPaid === "NO"
          ? false
          : null
    const commercialName = get(values, "COMMERCIAL")
    const commercialId = commercialName
      ? commercialsByName.get(normalizeCsvLookup(commercialName))
      : null
    const rawType = get(values, "TYPEDELOCATION")
    const type: LocationInput["type"] | null =
      !rawType || normalizeCsvLookup(rawType).includes("COURTE")
        ? "Courte durée"
        : normalizeCsvLookup(rawType).includes("LONGUE")
          ? "Longue durée"
          : null
    const rawStatus = get(values, "STATUT")
    const status = parseLocationCsvStatus(rawStatus)
    const observation = get(values, "OBSERVATION")

    if (!clientName) rowErrors.push("nom du client obligatoire")
    else if (clientName.length > 150) {
      rowErrors.push("nom du client limité à 150 caractères")
    }
    if (!registration) rowErrors.push("immatriculation obligatoire")
    else if (!vehicle && !normalizedRegistration) {
      rowErrors.push("immatriculation invalide")
    }
    if (!startDate) rowErrors.push("date de début invalide (JJ/MM/AAAA)")
    if (rawStartTime && !startTime) {
      rowErrors.push("heure de départ invalide (HH:MM)")
    }
    if (!endDate) rowErrors.push("date de fin invalide (JJ/MM/AAAA)")
    if (rawEndTime && !endTime) {
      rowErrors.push("heure de retour invalide (HH:MM)")
    }
    if (start && end && end <= start) {
      rowErrors.push(
        `retour (${rawEndDate}${
          rawEndTime ? ` ${rawEndTime}` : ""
        }) avant départ (${rawStartDate}${
          rawStartTime ? ` ${rawStartTime}` : ""
        })`,
      )
    }
    if (amount === null) rowErrors.push("montant invalide")
    if (modePaiement.length > 80) {
      rowErrors.push("mode de paiement limité à 80 caractères")
    }
    if (referenceFacture.length > 30) {
      rowErrors.push("référence de facture limitée à 30 caractères")
    }
    if (rawInvoiceDate && !invoiceDate) {
      rowErrors.push("date de facturation invalide (JJ/MM/AAAA)")
    }
    if (rawPaymentDate && !paymentDate) {
      rowErrors.push("date de paiement invalide (JJ/MM/AAAA)")
    }
    if (rawPaid && paid === null) {
      rowErrors.push("PAYE doit contenir Oui ou Non")
    }
    if (commercialName && !commercialId) {
      rowErrors.push(`commercial « ${commercialName} » introuvable`)
    }
    if (!type) rowErrors.push(`type de location « ${rawType} » invalide`)
    if (status === null) {
      rowErrors.push(
        `statut « ${rawStatus} » invalide (EN_COURS, TERMINEE, EN_RETARD, EN_PROLONGATION)`,
      )
    }
    if (observation.length > 255) {
      rowErrors.push("observation limitée à 255 caractères")
    }

    if (rowErrors.length > 0) {
      errors.push(`Ligne ${line} : ${rowErrors.join(", ")}.`)
      continue
    }

    const vehicleKey = vehicle
      ? `parc:${vehicle.id}`
      : `sous-location:${normalizedRegistration}`
    const previous = importedVehicles.get(vehicleKey) ?? []
    const overlappingRow = previous.find(
      (candidate) => candidate.debut < end! && start! < candidate.fin,
    )
    if (overlappingRow) {
      errors.push(
        `Ligne ${line} : chevauchement avec la ligne ${overlappingRow.line}.`,
      )
      continue
    }

    previous.push({ debut: start!, fin: end!, line })
    importedVehicles.set(vehicleKey, previous)
    inputs.push({
      clientId: clientId ?? null,
      clientName,
      vehiculeId: vehicle?.id ?? null,
      immatriculation: registration,
      line,
      commercialId,
      type: type!,
      dateDebut: start!,
      dateFin: end!,
      montant: amount!,
      statut: status ?? "EN_COURS",
      observation: observation || null,
      modePaiement: modePaiement || null,
      referenceFacture: referenceFacture || null,
      dateFacturation: invoiceDate,
      paye: paid,
      payeImport: get(values, "PAYE"),
      datePaiement: paymentDate,
    })
  }

  if (errors.length > 0) {
    throw badRequest(
      `Import annulé : ${errors.length} erreur(s).\n${errors.slice(0, 20).join("\n")}`,
      errors,
    )
  }

  return inputs
}

function parseReservationCsvDate(value: string): string | null {
  const parsed = parseCsvDate(value)
  return parsed?.slice(0, 10) ?? null
}

function parseReservationStatus(
  value: string,
): ReservationImportInput["statut"] | null {
  const status = normalizeCsvLookup(value).replace(/[^A-Z0-9]/g, "")
  if (!status) return null
  if (status.includes("AVENIR") || status.includes("REPORTE")) {
    return "À venir"
  }
  if (status.includes("ATTENTE")) return "À venir"
  if (status.includes("ENCOURS") || status.includes("LOCATIONENCOURS")) {
    return "En cours"
  }
  if (status.includes("TERMINE")) return "Terminée"
  if (status.includes("ANNULE")) return "Annulée"
  return null
}

function parseReservationBillingStatus(
  value: string,
): ReservationImportInput["statutFacturation"] | null {
  const status = normalizeCsvLookup(value)
  if (!status) return "NON_FACTUREE"
  if (status.includes("PAIEMENT EFFECTUE")) return "PAIEMENT_EFFECTUE"
  if (status.includes("FACTURE EMISE")) {
    return "FACTURE_EMISE_PAIEMENT_EN_ATTENTE"
  }
  if (status.includes("BON DE COMMANDE")) return "EN_ATTENTE_BON_COMMANDE"
  if (status.includes("CONFIRMATION")) return "EN_ATTENTE_BON_COMMANDE"
  return null
}

function parseReservationCsv(
  csv: string,
  clients: Awaited<ReturnType<Repositories["clients"]["fiches"]>>,
  vehicles: Awaited<ReturnType<Repositories["vehicules"]["list"]>>,
  commercials: Awaited<ReturnType<Repositories["commerciaux"]["fiches"]>>,
): Array<{ line: number; input: ReservationImportInput }> {
  let rows: string[][]
  try {
    rows = parseCsvDocument(csv.replace(/^\uFEFF/, ""))
  } catch (error) {
    if (error instanceof CsvParseError) throw badRequest(error.message)
    throw error
  }

  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeCsvHeader)
    return (
      headers.includes("IMMATRICULATION") &&
      headers.includes("AGENTDEVENTE") &&
      headers.includes("DATEDERESA") &&
      headers.includes("STATUTDELARESA")
    )
  })
  if (headerIndex < 0) {
    throw badRequest(
      "En-têtes CSV de réservations non reconnus. Téléchargez le modèle depuis le module Réservations.",
    )
  }

  const headerKeys = rows[headerIndex]!.map(normalizeCsvHeader)
  const indexes = new Map(headerKeys.map((key, index) => [key, index]))
  const missingHeaders = RESERVATION_CSV_HEADERS.filter(
    (header) => !indexes.has(normalizeCsvHeader(header)),
  )
  if (missingHeaders.length > 0) {
    throw badRequest(
      `Colonnes manquantes : ${missingHeaders.join(", ")}. Téléchargez le modèle depuis le module Réservations.`,
    )
  }
  const get = (values: string[], key: string) =>
    values[indexes.get(normalizeCsvHeader(key)) ?? -1]?.trim() ?? ""
  const dataRows = rows
    .slice(headerIndex + 1)
    .map((values, index) => ({ values, line: headerIndex + index + 2 }))
    .filter(({ values }) => values.some((value) => value.trim() !== ""))
    .filter(
      ({ values }) =>
        !normalizeCsvLookup(get(values, "Client")).startsWith("EXEMPLE"),
    )
    .filter(({ values }) =>
      values.some(
        (value, index) =>
          index < headerKeys.length && index !== 6 && value.trim() !== "",
      ),
    )

  if (dataRows.length === 0) {
    throw badRequest("Le fichier ne contient aucune réservation à importer.")
  }
  if (dataRows.length > 2000) {
    throw badRequest("L’import est limité à 2 000 réservations par fichier.")
  }

  const clientByName = new Map<string, number>()
  for (const client of clients) {
    const names = [client.nom]
    if (client.prenom) names.push(`${client.prenom} ${client.nom}`)
    if (client.prenom && client.nomFamille) {
      names.push(`${client.prenom} ${client.nomFamille}`)
    }
    for (const name of names) {
      clientByName.set(normalizeCsvName(name), client.id)
    }
  }
  const vehicleByPlate = new Map(
    vehicles.map((vehicle) => [
      vehicle.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase(),
      vehicle,
    ]),
  )
  const commercialByName = new Map<string, number>()
  for (const commercial of commercials) {
    if (commercial.actif === false) continue
    commercialByName.set(normalizeCsvLookup(commercial.nom), commercial.id)
    if (commercial.prenom) {
      commercialByName.set(normalizeCsvLookup(commercial.prenom), commercial.id)
      commercialByName.set(
        normalizeCsvLookup(
          `${commercial.prenom} ${commercial.nomFamille ?? commercial.nom}`,
        ),
        commercial.id,
      )
    }
    if (commercial.abreviation) {
      commercialByName.set(
        normalizeCsvLookup(commercial.abreviation),
        commercial.id,
      )
    }
  }

  const parsed: Array<{ line: number; input: ReservationImportInput }> = []
  const errors: string[] = []
  for (const { values, line } of dataRows) {
    const rowErrors: string[] = []
    const plate = get(values, "Immatriculation")
    const vehicle = vehicleByPlate.get(
      plate.replace(/[^a-z0-9]/gi, "").toUpperCase(),
    )
    const clientName = get(values, "Client")
    const clientId = clientByName.get(normalizeCsvName(clientName))
    const commercialName = get(values, "Agent de vente")
    const commercialId = commercialByName.get(
      normalizeCsvLookup(commercialName),
    )
    const bookingText = get(values, "Date de Résa")
    const startText = get(values, "Date de début")
    const endText = get(values, "Date prévu de retour")
    const bookingDate = bookingText
      ? parseReservationCsvDate(bookingText)
      : null
    const startDate = startText ? parseReservationCsvDate(startText) : null
    const endDate = endText ? parseReservationCsvDate(endText) : null
    const rawConfirmation = get(values, "Statut de confirmation")
    const rawReservationStatus = get(values, "Statut de la résa")
    const rawBillingStatus = get(values, "Statut de la facturation")
    const rawDuration = get(values, "Durée (j)")
    const confirmationStatus = normalizeCsvLookup(rawConfirmation)
    const parsedReservationStatus = parseReservationStatus(rawReservationStatus)
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Porto-Novo",
    }).format(new Date())
    const reservationStatus =
      parsedReservationStatus ??
      (confirmationStatus.includes("ANNULE")
        ? "Annulée"
        : endDate && endDate < today
          ? "Terminée"
          : startDate && startDate <= today && endDate && endDate >= today
            ? "En cours"
            : "À venir")
    const billingStatus = parseReservationBillingStatus(rawBillingStatus)

    if (!vehicle) rowErrors.push(`véhicule « ${plate} » introuvable`)
    if (bookingText && !bookingDate) {
      rowErrors.push("date de réservation invalide (JJ/MM/AAAA)")
    }
    if (startText && !startDate) {
      rowErrors.push("date de début invalide (JJ/MM/AAAA)")
    }
    if (endText && !endDate) {
      rowErrors.push("date de retour prévue invalide (JJ/MM/AAAA)")
    }
    if (startDate && endDate && endDate < startDate) {
      rowErrors.push("la date de retour prévue précède la date de début")
    }
    if (rawReservationStatus && !parsedReservationStatus) {
      rowErrors.push(
        `statut de réservation « ${rawReservationStatus} » non reconnu`,
      )
    }
    if (clientName.length > 150) {
      rowErrors.push("nom du client limité à 150 caractères")
    }
    if (
      rawDuration &&
      (!/^\d+$/.test(rawDuration) || Number(rawDuration) < 0)
    ) {
      rowErrors.push("durée invalide (nombre entier positif ou nul attendu)")
    }
    if (rawConfirmation.length > 80) {
      rowErrors.push("statut de confirmation limité à 80 caractères")
    }
    if (rawBillingStatus && !billingStatus) {
      rowErrors.push(
        `statut de facturation « ${rawBillingStatus} » non reconnu`,
      )
    }
    const mission = get(values, "Mission")
    const place = get(values, "Lieu de la mission")
    if (mission.length > 150) rowErrors.push("mission limitée à 150 caractères")
    if (place.length > 150)
      rowErrors.push("lieu de mission limité à 150 caractères")

    if (rowErrors.length > 0) {
      errors.push(`Ligne ${line} : ${rowErrors.join(", ")}.`)
      continue
    }

    const compactConfirmation = confirmationStatus.replace(/[^A-Z0-9]/g, "")
    const confirmationPaid =
      (!compactConfirmation.includes("NONPAYE") &&
        compactConfirmation.includes("PAYE")) ||
      compactConfirmation.includes("PAIEMENTEFFECTUE") ||
      billingStatus === "PAIEMENT_EFFECTUE"
    parsed.push({
      line,
      input: {
        clientId: clientId ?? null,
        clientImport: clientId === undefined ? clientName || null : null,
        vehiculeId: vehicle!.id,
        commercialId: commercialId ?? null,
        commercialImport: commercialName || null,
        dateReservation: bookingDate,
        dateDepart: startDate,
        dateFin: endDate,
        dureeJours: rawDuration ? Number(rawDuration) : null,
        mission: mission || null,
        lieuMission: place || null,
        statut: reservationStatus!,
        statutConfirmation: rawConfirmation || null,
        statutFacturation: billingStatus!,
        statutPaiement: confirmationPaid ? "PAYEE" : "NON_PAYEE",
      },
    })
  }

  if (errors.length > 0) {
    throw badRequest(
      `Import annulé : ${errors.length} erreur(s).\n${errors.slice(0, 30).join("\n")}`,
      errors,
    )
  }

  return parsed
}

function parseCommercialCsv(
  csv: string,

  agencies: Awaited<ReturnType<Repositories["agences"]["list"]>>,
): CommercialInput[] {
  let rows: string[][]

  try {
    rows = parseCsvDocument(csv.replace(/^\uFEFF/, ""))
  } catch (error) {
    if (error instanceof CsvParseError) throw badRequest(error.message)

    throw error
  }

  const headers = rows[0]?.map((header) =>
    normalizeCsvHeader(header.replace(/^\uFEFF/, "").trim()),
  )
  const fullNameFormat =
    headers?.length === COMMERCIAL_FULLNAME_CSV_HEADERS.length &&
    headers.every(
      (header, index) => header === COMMERCIAL_FULLNAME_CSV_HEADERS[index],
    )
  const legacyFormat =
    headers?.length === COMMERCIAL_CSV_HEADERS.length &&
    headers.every((header, index) => header === COMMERCIAL_CSV_HEADERS[index])

  if (!fullNameFormat && !legacyFormat) {
    throw badRequest(
      "En-têtes CSV invalides. Utilisez le format « Nom et prénoms, Abréviations, Agence, Code Agence, Telephone, Email » ou un ancien modèle « Prénom, NOM, Abréviations, Agence, Code Agence, Telephone, Email ».",
    )
  }

  const dataRows = rows

    .slice(1)

    .map((values, index) => ({ values, line: index + 2 }))

    .filter(({ values }) => values.some((value) => value.trim() !== ""))

    .filter(
      ({ values }) =>
        !normalizeCsvLookup(values[0] ?? "").startsWith("EXEMPLE"),
    )

  if (dataRows.length === 0) {
    throw badRequest(
      "Le fichier ne contient aucun commercial à importer. Remplacez les lignes dont le nom commence par « EXEMPLE ».",
    )
  }

  if (dataRows.length > 500)
    throw badRequest("L’import est limité à 500 commerciaux par fichier.")

  const agenciesByCode = new Map(
    agencies

      .filter((agency) => agency.actif)

      .map((agency) => [normalizeCsvLookup(agency.code), agency]),
  )

  const seenAbbreviations = new Set<string>()

  const errors: string[] = []

  const inputs: CommercialInput[] = []

  for (const { values, line } of dataRows) {
    const expectedColumnCount = fullNameFormat
      ? COMMERCIAL_FULLNAME_CSV_HEADERS.length
      : COMMERCIAL_CSV_HEADERS.length
    if (values.length !== expectedColumnCount) {
      errors.push(
        `Ligne ${line} : ${expectedColumnCount} colonnes attendues, ${values.length} reçues.`,
      )

      continue
    }

    const rowValues = values.map((value) => value.trim())
    const commercialValues = fullNameFormat ? ["", ...rowValues] : rowValues
    const [
      prenom,
      nom,
      rawAbbreviation,
      rawAgencyName,
      rawAgencyCode,
      telephone,
      email,
    ] = commercialValues

    const rowErrors: string[] = []

    if (fullNameFormat) {
      if (!nom) rowErrors.push("nom et prénoms manquants")
      else if (nom.length > 80) {
        rowErrors.push("nom et prénoms limités à 80 caractères")
      }
    } else {
      if (!prenom) rowErrors.push("prénom manquant")
      else if (prenom.length > 80) {
        rowErrors.push("prénom limité à 80 caractères")
      }

      if (!nom) rowErrors.push("nom manquant")
      else if (nom.length > 80) rowErrors.push("nom limité à 80 caractères")
    }

    if (!rawAbbreviation) rowErrors.push("abréviation manquante")
    else if (rawAbbreviation.length > 10)
      rowErrors.push("abréviation limitée à 10 caractères")

    const abbreviation = rawAbbreviation.toUpperCase()

    if (abbreviation && seenAbbreviations.has(abbreviation)) {
      rowErrors.push("abréviation déjà présente dans le fichier")
    }

    if (abbreviation) seenAbbreviations.add(abbreviation)

    const agency = agenciesByCode.get(normalizeCsvLookup(rawAgencyCode))

    if (!rawAgencyCode) rowErrors.push("code agence manquant")
    else if (!agency)
      rowErrors.push(`code agence « ${rawAgencyCode} » introuvable ou inactif`)
    else if (
      normalizeCsvLookup(agency.nom) !== normalizeCsvLookup(rawAgencyName)
    ) {
      rowErrors.push(
        `l’agence « ${rawAgencyName} » ne correspond pas au code ${agency.code}`,
      )
    }

    if (!rawAgencyName) rowErrors.push("agence manquante")

    if (telephone && telephone.length > 30) {
      rowErrors.push("téléphone limité à 30 caractères")
    }
    if (
      email &&
      (email.length > 120 || !z.string().email().safeParse(email).success)
    ) {
      rowErrors.push("adresse e-mail invalide")
    }

    if (rowErrors.length > 0) {
      errors.push(`Ligne ${line} : ${rowErrors.join(", ")}.`)

      continue
    }

    inputs.push({
      nom,

      prenom: prenom || undefined,

      abreviation: abbreviation,
      telephone: telephone || undefined,
      email: email || undefined,
    })
  }

  if (errors.length > 0) {
    throw badRequest(`Import annulé : ${errors.join(" ")}`, errors)
  }

  return inputs
}

const dateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}, "Date invalide (format AAAA-MM-JJ)")

const reservationSchema = z
  .object({
    clientId: z.number().int().positive().nullable().optional(),

    vehiculeId: z.number().int().positive(),

    commercialId: z.number().int().positive().nullable().optional(),

    dateReservation: dateSchema.nullable().optional(),

    dateDepart: dateSchema.nullable().optional(),

    dateFin: dateSchema.nullable().optional(),

    mission: z.string().trim().max(150).nullable().optional(),

    lieuMission: z.string().trim().max(150).nullable().optional(),

    statutConfirmation: z.string().trim().max(80).nullable().optional(),

    statutFacturation: z
      .enum([
        "NON_FACTUREE",
        "EN_ATTENTE_BON_COMMANDE",
        "FACTURE_EMISE_PAIEMENT_EN_ATTENTE",
        "PAIEMENT_EFFECTUE",
      ])
      .optional(),

    statutPaiement: z.enum(["NON_PAYEE", "PAYEE"]).optional(),
  })
  .refine(
    ({ dateDepart, dateFin }) => Boolean(dateDepart) === Boolean(dateFin),
    {
      message: "Renseignez les deux dates prévues ou laissez-les vides.",
      path: ["dateFin"],
    },
  )
  .refine(
    ({ dateDepart, dateFin }) =>
      !dateDepart || !dateFin || dateFin >= dateDepart,
    {
      message: "La date de fin doit être après ou égale à la date de départ",
      path: ["dateFin"],
    },
  )

const reservationUpdateSchema = z
  .object({
    clientId: z.number().int().positive().nullable(),
    vehiculeId: z.number().int().positive(),
    commercialId: z.number().int().positive().nullable(),
    clientImport: z.string().trim().max(180).nullable(),
    commercialImport: z.string().trim().max(180).nullable(),
    dateReservation: dateSchema.nullable(),
    dateDepart: dateSchema.nullable(),
    dateFin: dateSchema.nullable(),
    mission: z.string().trim().max(150).nullable(),
    lieuMission: z.string().trim().max(150).nullable(),
    statutConfirmation: z.string().trim().max(80).nullable(),
    statutFacturation: z.enum([
      "NON_FACTUREE",
      "EN_ATTENTE_BON_COMMANDE",
      "FACTURE_EMISE_PAIEMENT_EN_ATTENTE",
      "PAIEMENT_EFFECTUE",
    ]),
    statutPaiement: z.enum(["NON_PAYEE", "PAYEE"]),
  })
  .refine(
    ({ dateDepart, dateFin }) =>
      !dateDepart || !dateFin || dateFin >= dateDepart,
    {
      message:
        "La date de retour doit être après ou égale à la date de départ.",
      path: ["dateFin"],
    },
  )

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  )
}

function isForeignKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ER_ROW_IS_REFERENCED_2" ||
      error.code === "ER_NO_REFERENCED_ROW_2")
  )
}

function idParam(value: string): number {
  const id = Number(value)

  if (!Number.isSafeInteger(id) || id < 1)
    throw badRequest("Identifiant invalide")

  return id
}

// Listes, fiches et écritures des clients, commerciaux, réservations et locations.

export function listsRouter(repos: Repositories, env: Env): Router {
  const router = Router()

  const guard = [
    requireAuth(env.JWT_SECRET),
    requireRole("responsable", "admin"),
  ]

  const locationSchemaBase = z.object({
    reference: z.string().trim().max(30).nullable().optional(),

    clientId: z.number().int().positive(),

    vehiculeId: z.number().int().positive(),

    commercialId: z.number().int().positive().nullable().optional(),

    type: z.enum(["Courte durée", "Longue durée"]),

    dateDebut: z.string().trim().min(10).max(25),

    dateFin: z.string().trim().min(10).max(25),

    kmRetour: z.number().int().min(0).nullable().optional(),

    montant: z.number().min(0).optional(),

    observation: z.string().trim().max(255).nullable().optional(),

    modePaiement: z.string().trim().max(80).nullable().optional(),

    referenceFacture: z.string().trim().max(30).nullable().optional(),

    dateFacturation: z.string().trim().max(25).nullable().optional(),

    paye: z.boolean().nullable().optional(),

    payeImport: z.string().max(10).nullable().optional(),

    datePaiement: z.string().trim().max(25).nullable().optional(),

    statut: z
      .enum(["EN_COURS", "TERMINEE", "EN_RETARD", "EN_PROLONGATION"])
      .optional(),

    prolongation: z
      .object({
        ancienneDateFin: z
          .string()
          .trim()
          .min(10)
          .max(25)
          .nullable()
          .optional(),

        nouvelleDateFin: z.string().trim().min(10).max(25),

        dateDemande: z.string().trim().min(10).max(25),

        motif: z.string().trim().max(255).nullable().optional(),

        montantSupplementaire: z.number().min(0),

        commercialId: z.number().int().positive().nullable().optional(),
      })
      .optional(),
  })

  const locationSchema = locationSchemaBase.superRefine((value, context) => {
    if (value.statut === "TERMINEE" && value.kmRetour == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kmRetour"],
        message:
          "Le kilométrage de retour est obligatoire pour une location terminée.",
      })
    }
  })

  const sousLocationUpdateSchema = z
    .object({
      reference: z.string().trim().min(1).max(30).nullable(),
      clientId: z.number().int().positive(),
      commercialId: z.number().int().positive().nullable(),
      type: z.enum(["Courte durée", "Longue durée"]),
      dateDebut: z.string().trim().min(10).max(25),
      dateFin: z.string().trim().min(10).max(25),
      montant: z.number().min(0),
      statut: z.enum(["EN_COURS", "TERMINEE", "EN_RETARD", "EN_PROLONGATION"]),
      observation: z.string().trim().max(255).nullable(),
      modePaiement: z.string().trim().max(80).nullable(),
      referenceFacture: z.string().trim().max(30).nullable(),
      dateFacturation: z.string().trim().max(25).nullable(),
      paye: z.boolean().nullable(),
      payeImport: z.string().max(10).nullable(),
      datePaiement: z.string().trim().max(25).nullable(),
    })
    .superRefine((value, context) => {
      const start = Date.parse(value.dateDebut.replace(" ", "T"))
      const end = Date.parse(value.dateFin.replace(" ", "T"))
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateFin"],
          message: "La date/heure de retour doit être après le départ.",
        })
      }
    })

  const prolongationSchema = z.object({
    locationId: z.number().int().positive(),

    ancienneDateFin: z.string().trim().min(10).max(25).nullable().optional(),

    nouvelleDateFin: z.string().trim().min(10).max(25),

    dateDemande: z.string().trim().min(10).max(25),

    motif: z.string().trim().max(255).nullable().optional(),

    montantSupplementaire: z.number().min(0),

    commercialId: z.number().int().positive().nullable().optional(),
  })

  router.post(
    "/clients",

    [...guard, validateBody(clientSchema)],

    asyncHandler(async (req, res) => {
      try {
        const created = await repos.clients.create(req.body, req.user!.id)

        res.status(201).json(created)
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw conflict("Numéro de permis déjà enregistré")
        }

        throw error
      }
    }),
  )

  router.put(
    "/clients/:id",

    [...guard, validateBody(clientSchema)],

    asyncHandler(async (req, res) => {
      const updated = await repos.clients.update(
        idParam(req.params.id),
        req.body,
      )

      if (!updated) throw notFound("Client introuvable")

      res.json(updated)
    }),
  )

  router.delete(
    "/clients/:id",

    guard,

    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id)

      try {
        if (!(await repos.clients.remove(id)))
          throw notFound("Client introuvable")
      } catch (error) {
        if (isForeignKeyError(error)) {
          throw conflict(
            "Client associé à des locations ou réservations : suppression interdite",
          )
        }

        throw error
      }

      res.status(204).end()
    }),
  )

  router.post(
    "/commerciaux/import-csv",

    [...guard, validateBody(commercialCsvSchema)],

    asyncHandler(async (req, res) => {
      const agencies = await repos.agences.list()

      const inputs = parseCommercialCsv(req.body.csv, agencies)

      try {
        res.json(await repos.commerciaux.importMany(inputs, req.user!.id))
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw conflict(
            "Import annulé : une abréviation est déjà utilisée par un autre commercial.",
          )
        }

        throw error
      }
    }),
  )

  router.post(
    "/commerciaux",

    [...guard, validateBody(commercialSchema)],

    asyncHandler(async (req, res) => {
      if (req.body.agenceId && !(await repos.agences.get(req.body.agenceId))) {
        throw notFound("Agence introuvable")
      }

      try {
        res
          .status(201)
          .json(await repos.commerciaux.create(req.body, req.user!.id))
      } catch (error) {
        if (isDuplicateKeyError(error))
          throw conflict("E-mail ou abréviation déjà utilisé")

        throw error
      }
    }),
  )

  router.put(
    "/commerciaux/:id",

    [...guard, validateBody(commercialSchema)],

    asyncHandler(async (req, res) => {
      if (req.body.agenceId && !(await repos.agences.get(req.body.agenceId))) {
        throw notFound("Agence introuvable")
      }

      try {
        const updated = await repos.commerciaux.update(
          idParam(req.params.id),
          req.body,
        )

        if (!updated) throw notFound("Commercial introuvable")

        res.json(updated)
      } catch (error) {
        if (isDuplicateKeyError(error))
          throw conflict("E-mail ou abréviation déjà utilisé")

        throw error
      }
    }),
  )

  router.delete(
    "/commerciaux/:id",

    guard,

    asyncHandler(async (req, res) => {
      try {
        if (!(await repos.commerciaux.remove(idParam(req.params.id)))) {
          throw notFound("Commercial introuvable")
        }
      } catch (error) {
        if (isForeignKeyError(error)) {
          throw conflict(
            "Ce commercial est associé à des données historiques (locations, réservations, affaires perdues ou sorties internes) et ne peut pas être supprimé définitivement.",
          )
        }
        throw error
      }

      res.status(204).end()
    }),
  )

  router.post(
    "/reservations",

    [...guard, validateBody(reservationSchema)],

    asyncHandler(async (req, res) => {
      const { clientId, vehiculeId, commercialId } = req.body

      const [client, vehicle, commercial, maintenance] = await Promise.all([
        clientId ? repos.clients.get(clientId) : null,
        repos.vehicules.get(vehiculeId),
        commercialId ? repos.commerciaux.get(commercialId) : null,
        req.body.dateDepart && req.body.dateFin
          ? repos.maintenances.overlapping(
              vehiculeId,
              req.body.dateDepart,
              req.body.dateFin,
            )
          : Promise.resolve([]),
      ])

      if (clientId && !client) throw notFound("Client introuvable")
      if (!vehicle) throw notFound("Véhicule introuvable")
      if (!canStartVehicleOperation(vehicle.statut)) {
        throw conflict(
          `La réservation est autorisée uniquement pour un véhicule au statut ENTREE_PARC, RETOUR_LOCATION, RETOUR_GARAGE ou RETOUR_INTERNE. Statut actuel : ${vehicle.statut}.`,
        )
      }
      if (commercialId && !commercial) {
        throw notFound("Commercial introuvable ou désactivé")
      }

      if (maintenance.length)
        throw conflict(`Véhicule au garage : ${maintenance[0]!.motif}`)

      try {
        res.status(201).json(await repos.reservations.create(req.body))
      } catch (error) {
        if (error instanceof AvailabilityConflictError)
          throw conflict(error.message)

        throw error
      }
    }),
  )

  router.post(
    "/reservations/import-csv",
    [...guard, validateBody(locationCsvSchema)],
    asyncHandler(async (req, res) => {
      const [clients, vehicles, commercials] = await Promise.all([
        repos.clients.fiches(),
        repos.vehicules.list(),
        repos.commerciaux.fiches(),
      ])
      const rows = parseReservationCsv(
        req.body.csv,
        clients,
        vehicles,
        commercials,
      )
      const seen = new Map<number, Array<{ debut: string; fin: string }>>()
      const errors: string[] = []

      for (const { line, input } of rows) {
        if (["À venir", "En cours"].includes(input.statut)) {
          const vehicle = vehicles.find((item) => item.id === input.vehiculeId)
          if (!vehicle) {
            errors.push(`Ligne ${line} : véhicule introuvable.`)
            continue
          }
          if (!canStartVehicleOperation(vehicle.statut)) {
            errors.push(
              `Ligne ${line} : réservation impossible, statut du véhicule ${vehicle.statut}.`,
            )
            continue
          }
        }
        if (input.statut !== "À venir" && input.statut !== "En cours") {
          continue
        }
        if (!input.dateDepart || !input.dateFin) continue

        const now = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Africa/Porto-Novo",
        }).format(new Date())
        if (
          (input.statut === "À venir" && input.dateDepart < now) ||
          (input.statut === "En cours" && input.dateFin < now)
        ) {
          continue
        }

        const previous = seen.get(input.vehiculeId) ?? []
        if (
          previous.some(
            (period) =>
              period.debut <= input.dateFin! && input.dateDepart! <= period.fin,
          )
        ) {
          errors.push(
            `Ligne ${line} : chevauchement avec une autre réservation importée.`,
          )
          continue
        }
        previous.push({ debut: input.dateDepart, fin: input.dateFin })
        seen.set(input.vehiculeId, previous)

        const [reservations, locations, maintenance] = await Promise.all([
          repos.reservations.overlapping(
            input.vehiculeId,
            input.dateDepart,
            input.dateFin,
          ),
          repos.locations.overlapping(
            input.vehiculeId,
            input.dateDepart,
            input.dateFin,
          ),
          repos.maintenances.overlapping(
            input.vehiculeId,
            input.dateDepart,
            input.dateFin,
          ),
        ])
        if (reservations.length > 0) {
          errors.push(
            `Ligne ${line} : réservation existante sur cette période.`,
          )
        }
        if (locations.length > 0) {
          errors.push(`Ligne ${line} : location existante sur cette période.`)
        }
        if (maintenance.length > 0) {
          errors.push(
            `Ligne ${line} : véhicule au garage (${maintenance[0]!.motif}).`,
          )
        }
      }

      if (errors.length > 0) {
        throw conflict(
          `Import annulé : ${errors.length} conflit(s).\n${errors.slice(0, 30).join("\n")}`,
        )
      }

      const missingClients = new Map<string, string>()
      for (const { input } of rows) {
        if (input.clientId === null && input.clientImport) {
          const key = normalizeCsvName(input.clientImport)
          if (!missingClients.has(key)) {
            missingClients.set(key, input.clientImport)
          }
        }
      }

      const createdClientIds = new Map<string, number>()
      for (const [key, name] of missingClients) {
        const client = await repos.clients.create(
          {
            nom: name,
            type: "Particulier",
            telephone: "",
          },
          req.user!.id,
        )
        createdClientIds.set(key, client.id)
      }

      const reservationInputs = rows.map(({ input }) => {
        if (input.clientId !== null || !input.clientImport) return input
        const clientId = createdClientIds.get(
          normalizeCsvName(input.clientImport),
        )
        if (clientId === undefined) {
          throw new Error(
            `Client « ${input.clientImport} » introuvable après création`,
          )
        }
        return { ...input, clientId, clientImport: null }
      })

      try {
        const created = await repos.reservations.importMany(reservationInputs)
        res.status(201).json({
          created,
          clientsCreated: missingClients.size,
          unresolvedClients: reservationInputs.filter(
            (input) => input.clientId === null && input.clientImport,
          ).length,
          unresolvedCommercials: rows.filter(
            ({ input }) =>
              input.commercialId === null && input.commercialImport,
          ).length,
        })
      } catch (error) {
        if (error instanceof AvailabilityConflictError) {
          throw conflict(`Import annulé : ${error.message}`)
        }
        throw error
      }
    }),
  )

  router.get(
    "/reservations/affaires-perdues",
    guard,
    asyncHandler(async (_req, res) => {
      res.json(await repos.reservations.lostAffairsFromReservations())
    }),
  )

  router.put(
    "/reservations/:id/status",
    [...guard, validateBody(reservationStatusSchema)],
    asyncHandler(async (req, res) => {
      try {
        const updated = await repos.reservations.updateStatus(
          idParam(req.params.id),
          req.body.status,
        )
        if (!updated) throw notFound("Réservation introuvable")
        res.json(updated)
      } catch (error) {
        if (error instanceof ReservationStatusConflictError) {
          throw conflict(error.message)
        }
        throw error
      }
    }),
  )

  router.get(
    "/reservations/:id/history",
    guard,
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id)
      if (!(await repos.reservations.get(id))) {
        throw notFound("Réservation introuvable")
      }
      res.json(await repos.reservations.history(id))
    }),
  )

  router.put(
    "/reservations/:id",
    [...guard, validateBody(reservationUpdateSchema)],
    asyncHandler(async (req, res) => {
      const input = req.body as ReservationUpdateInput
      const id = idParam(req.params.id)
      const current = await repos.reservations.get(id)
      if (!current) throw notFound("Réservation introuvable")
      const [vehicle, client, commercial, maintenance] = await Promise.all([
        repos.vehicules.get(input.vehiculeId),
        input.clientId === null ? null : repos.clients.get(input.clientId),
        input.commercialId === null
          ? null
          : repos.commerciaux.get(input.commercialId),
        input.dateDepart && input.dateFin
          ? repos.maintenances.overlapping(
              input.vehiculeId,
              input.dateDepart,
              input.dateFin,
            )
          : Promise.resolve([]),
      ])
      if (!vehicle) throw notFound("Véhicule introuvable")
      if (
        ["À venir", "En cours"].includes(current.statut) &&
        current.vehiculeId !== input.vehiculeId &&
        !canStartVehicleOperation(vehicle.statut)
      ) {
        throw conflict(
          `La réservation est autorisée uniquement pour un véhicule au statut ENTREE_PARC, RETOUR_LOCATION, RETOUR_GARAGE ou RETOUR_INTERNE. Statut actuel : ${vehicle.statut}.`,
        )
      }
      if (input.clientId !== null && !client)
        throw notFound("Client introuvable")
      if (input.commercialId !== null && !commercial) {
        throw notFound("Commercial introuvable ou désactivé")
      }
      if (maintenance.length) {
        throw conflict(`Véhicule au garage : ${maintenance[0]!.motif}`)
      }
      try {
        const updated = await repos.reservations.update(id, input)
        if (!updated) throw notFound("Réservation introuvable")
        res.json(updated)
      } catch (error) {
        if (error instanceof AvailabilityConflictError) {
          throw conflict(error.message)
        }
        throw error
      }
    }),
  )

  router.delete(
    "/reservations/:id",
    guard,
    asyncHandler(async (req, res) => {
      try {
        if (!(await repos.reservations.remove(idParam(req.params.id)))) {
          throw notFound("Réservation introuvable")
        }
      } catch (error) {
        if (error instanceof ReservationInUseError) {
          throw conflict(error.message)
        }
        if (isForeignKeyError(error)) {
          throw conflict(
            "Cette réservation est déjà liée à une location et ne peut pas être supprimée.",
          )
        }
        throw error
      }
      res.status(204).end()
    }),
  )

  router.post(
    "/locations/import-csv/preview",
    [...guard, validateBody(locationCsvSchema)],
    asyncHandler(async (req, res) => {
      const { csv } = locationCsvSchema.parse(req.body)
      const [clients, vehicles, sousLocationVehicles, commercials] =
        await Promise.all([
          repos.clients.fiches(),
          repos.vehicules.list(),
          repos.sousLocations.listVehicles(),
          repos.commerciaux.fiches(),
        ])
      const inputs = parseLocationCsv(csv, clients, vehicles, commercials)
      const existingSousLocations = new Set(
        sousLocationVehicles.map((vehicle) =>
          vehicle.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase(),
        ),
      )
      const unknownRegistrations = new Map<string, string>()
      for (const input of inputs) {
        const key = input.immatriculation
          .replace(/[^a-z0-9]/gi, "")
          .toUpperCase()
        if (
          input.vehiculeId === null &&
          !existingSousLocations.has(key) &&
          !unknownRegistrations.has(key)
        ) {
          unknownRegistrations.set(key, input.immatriculation.trim())
        }
      }

      res.json({ unknownRegistrations: [...unknownRegistrations.values()] })
    }),
  )

  router.post(
    "/locations/import-csv",
    [...guard, validateBody(locationImportSchema)],
    asyncHandler(async (req, res) => {
      const { csv, sousLocationImmatriculations } = locationImportSchema.parse(
        req.body,
      )
      const [clients, vehicles, sousLocationVehicles, commercials] =
        await Promise.all([
          repos.clients.fiches(),
          repos.vehicules.list(),
          repos.sousLocations.listVehicles(),
          repos.commerciaux.fiches(),
        ])
      const inputs = parseLocationCsv(csv, clients, vehicles, commercials)
      const existingSousLocationsByRegistration = new Map(
        sousLocationVehicles.map((vehicle) => [
          vehicle.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase(),
          vehicle,
        ]),
      )
      const unknownRegistrations = new Map<string, string>()
      for (const input of inputs) {
        const key = input.immatriculation
          .replace(/[^a-z0-9]/gi, "")
          .toUpperCase()
        if (
          input.vehiculeId === null &&
          !existingSousLocationsByRegistration.has(key)
        ) {
          unknownRegistrations.set(key, input.immatriculation.trim())
        }
      }
      const selectedSousLocations = new Set(
        sousLocationImmatriculations.map((registration) =>
          registration.replace(/[^a-z0-9]/gi, "").toUpperCase(),
        ),
      )
      const invalidSelections = [...selectedSousLocations].filter(
        (registration) => !unknownRegistrations.has(registration),
      )
      if (invalidSelections.length > 0) {
        throw badRequest(
          "La confirmation contient une immatriculation absente des véhicules à classer.",
        )
      }
      const vehiclesToAddToFleet = [...unknownRegistrations.entries()]
        .filter(([registration]) => !selectedSousLocations.has(registration))
        .map(([, registration]) => registration)
      if (vehiclesToAddToFleet.length > 0) {
        throw conflict(
          `Import refusé : enregistrez d’abord le(s) véhicule(s) suivant(s) dans le parc, puis relancez l’import : ${vehiclesToAddToFleet.join(", ")}.`,
        )
      }

      const errors: string[] = []
      for (const input of inputs) {
        if (input.vehiculeId !== null) {
          const vehicle = vehicles.find((item) => item.id === input.vehiculeId)
          if (
            input.statut !== "TERMINEE" &&
            vehicle &&
            !canStartVehicleOperation(vehicle.statut)
          ) {
            errors.push(
              `Ligne ${input.line} : location impossible, statut du véhicule ${vehicle.statut}.`,
            )
          }
          const [overlapping, maintenance] = await Promise.all([
            repos.locations.overlapping(
              input.vehiculeId,
              input.dateDebut,
              input.dateFin,
            ),
            repos.maintenances.overlapping(
              input.vehiculeId,
              input.dateDebut,
              input.dateFin,
            ),
          ])
          if (overlapping.length > 0) {
            errors.push(
              `Ligne ${input.line} : le véhicule est déjà réservé sur cette période.`,
            )
          }
          if (maintenance.length > 0) {
            errors.push(
              `Ligne ${input.line} : véhicule au garage (${maintenance[0]!.motif}).`,
            )
          }
        } else {
          const vehicle = existingSousLocationsByRegistration.get(
            input.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase(),
          )
          if (vehicle) {
            const overlapping = await repos.sousLocations.overlapping(
              vehicle.id,
              input.dateDebut,
              input.dateFin,
            )
            if (overlapping.length > 0) {
              errors.push(
                `Ligne ${input.line} : le véhicule de sous-location est déjà loué sur cette période.`,
              )
            }
          }
        }
      }
      if (errors.length > 0) {
        throw conflict(
          `Import annulé : ${errors.length} conflit(s).\n${errors.slice(0, 20).join("\n")}`,
        )
      }

      const missingClients = new Map<string, string>()
      for (const input of inputs) {
        if (input.clientId === null) {
          const key = clientNameKey(input.clientName)
          if (!missingClients.has(key)) {
            missingClients.set(key, input.clientName)
          }
        }
      }
      const createdClientIds = new Map<string, number>()
      for (const [key, name] of missingClients) {
        const client = await repos.clients.create(
          { nom: name, type: "Particulier", telephone: "" },
          req.user!.id,
        )
        createdClientIds.set(key, client.id)
      }

      const sousLocationIds = new Map(
        sousLocationVehicles.map((vehicle) => [
          vehicle.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase(),
          vehicle.id,
        ]),
      )
      let createdFleetLocations = 0
      let createdSousLocations = 0
      for (const input of inputs) {
        const clientId =
          input.clientId ??
          createdClientIds.get(clientNameKey(input.clientName))
        if (clientId === undefined) {
          throw new Error(
            `Client « ${input.clientName} » introuvable après création`,
          )
        }

        if (input.vehiculeId !== null) {
          try {
            await repos.locations.create(
              {
                reference: input.reference,
                clientId,
                vehiculeId: input.vehiculeId,
                commercialId: input.commercialId,
                type: input.type,
                dateDebut: input.dateDebut,
                dateFin: input.dateFin,
                montant: input.montant,
                statut: input.statut,
                observation: input.observation,
                modePaiement: input.modePaiement,
                referenceFacture: input.referenceFacture,
                dateFacturation: input.dateFacturation,
                paye: input.paye,
                payeImport: input.payeImport,
                datePaiement: input.datePaiement,
              },
              req.user!.id,
            )
            createdFleetLocations += 1
          } catch (error) {
            if (error instanceof AvailabilityConflictError) {
              throw conflict(`Import interrompu : ${error.message}`)
            }
            throw error
          }
        } else {
          const registrationKey = input.immatriculation
            .replace(/[^a-z0-9]/gi, "")
            .toUpperCase()
          let vehicleId = sousLocationIds.get(registrationKey)
          if (vehicleId === undefined) {
            vehicleId = await repos.sousLocations.createVehicle(
              unknownRegistrations.get(registrationKey) ??
                input.immatriculation.trim(),
              req.user!.id,
            )
            sousLocationIds.set(registrationKey, vehicleId)
          }
          await repos.sousLocations.create(
            {
              reference: input.reference,
              clientId,
              vehiculeSousLocationId: vehicleId,
              commercialId: input.commercialId ?? null,
              type: input.type,
              dateDebut: input.dateDebut,
              dateFin: input.dateFin,
              dateRetourReelle:
                input.statut === "TERMINEE" ? input.dateFin : null,
              montant: input.montant ?? 0,
              statut: input.statut ?? "EN_COURS",
              observation: input.observation,
              modePaiement: input.modePaiement,
              referenceFacture: input.referenceFacture,
              dateFacturation: input.dateFacturation,
              paye: input.paye,
              payeImport: input.payeImport,
              datePaiement: input.datePaiement,
            },
            req.user!.id,
          )
          createdSousLocations += 1
        }
      }

      res.status(201).json({
        created: createdFleetLocations + createdSousLocations,
        fleetLocationsCreated: createdFleetLocations,
        sousLocationsCreated: createdSousLocations,
        clientsCreated: missingClients.size,
      })
    }),
  )

  router.get(
    "/sous-locations/vehicules",
    guard,
    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)
      const rows = await repos.sousLocations.listVehicles()
      const needle = (q ?? "").trim().toLowerCase()
      const filtered = needle
        ? rows.filter((vehicle) =>
            `${vehicle.immatriculation} ${vehicle.marque ?? ""} ${vehicle.modele ?? ""} ${vehicle.statut}`
              .toLowerCase()
              .includes(needle),
          )
        : rows
      res.json(limit ? filtered.slice(0, limit) : filtered)
    }),
  )

  router.post(
    "/sous-locations/vehicules",
    [...guard, validateBody(sousLocationVehicleSchema)],
    asyncHandler(async (req, res) => {
      const input = sousLocationVehicleSchema.parse(req.body)
      const vehicles = await repos.sousLocations.listVehicles()
      const fleetVehicles = await repos.vehicules.list()
      const normalizedRegistration = input.immatriculation
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase()
      if (
        fleetVehicles.some(
          (vehicle) =>
            vehicle.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase() ===
            normalizedRegistration,
        )
      ) {
        throw conflict(
          "Cette immatriculation appartient déjà au parc automobile",
        )
      }
      if (
        vehicles.some(
          (vehicle) =>
            vehicle.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase() ===
            input.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase(),
        )
      ) {
        throw conflict("Immatriculation déjà enregistrée")
      }
      if (Boolean(input.marque) !== Boolean(input.modele)) {
        throw badRequest("Renseignez la marque et le modèle ensemble.")
      }
      if (
        input.marque &&
        input.modele &&
        !(await repos.modeles.list()).some(
          (model) =>
            model.marque === input.marque && model.nom === input.modele,
        )
      ) {
        throw notFound("Modèle introuvable dans le référentiel.")
      }
      if (
        input.categorieId &&
        !(await repos.categories.get(input.categorieId))
      ) {
        throw notFound("Catégorie introuvable")
      }
      if (input.centreId && !(await repos.centres.get(input.centreId))) {
        throw notFound("Centre introuvable")
      }
      try {
        res
          .status(201)
          .json(
            await repos.sousLocations.createVehicleRecord(input, req.user!.id),
          )
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw conflict("Immatriculation ou numéro de châssis déjà enregistré")
        }
        throw error
      }
    }),
  )

  router.put(
    "/sous-locations/vehicules/:id",
    [...guard, validateBody(sousLocationVehicleSchema.partial())],
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id)
      const input = sousLocationVehicleSchema.partial().parse(req.body)
      const current = (await repos.sousLocations.listVehicles()).find(
        (vehicle) => vehicle.id === id,
      )
      if (!current) throw notFound("Véhicule de sous-location introuvable")
      const nextImmatriculation =
        input.immatriculation ?? current.immatriculation
      const allVehicles = await repos.sousLocations.listVehicles()
      const normalizedRegistration = nextImmatriculation
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase()
      const currentNormalizedRegistration = current.immatriculation
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase()
      if (
        normalizedRegistration !== currentNormalizedRegistration &&
        (await repos.vehicules.list()).some(
          (vehicle) =>
            vehicle.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase() ===
            normalizedRegistration,
        )
      ) {
        throw conflict(
          "Cette immatriculation appartient déjà au parc automobile",
        )
      }
      if (
        allVehicles.some(
          (vehicle) =>
            vehicle.id !== id &&
            vehicle.immatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase() ===
              nextImmatriculation.replace(/[^a-z0-9]/gi, "").toUpperCase(),
        )
      ) {
        throw conflict("Immatriculation déjà enregistrée")
      }
      const nextMarque =
        input.marque === undefined ? (current.marque ?? null) : input.marque
      const nextModele =
        input.modele === undefined ? (current.modele ?? null) : input.modele
      if (Boolean(nextMarque) !== Boolean(nextModele)) {
        throw badRequest("Renseignez la marque et le modèle ensemble.")
      }
      if (
        nextMarque &&
        nextModele &&
        !(await repos.modeles.list()).some(
          (model) => model.marque === nextMarque && model.nom === nextModele,
        )
      ) {
        throw notFound("Modèle introuvable dans le référentiel.")
      }
      if (
        input.categorieId &&
        !(await repos.categories.get(input.categorieId))
      ) {
        throw notFound("Catégorie introuvable")
      }
      if (input.centreId && !(await repos.centres.get(input.centreId))) {
        throw notFound("Centre introuvable")
      }
      try {
        const updated = await repos.sousLocations.updateVehicle(id, input)
        if (!updated) throw notFound("Véhicule de sous-location introuvable")
        res.json(updated)
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw conflict("Immatriculation ou numéro de châssis déjà enregistré")
        }
        throw error
      }
    }),
  )

  router.delete(
    "/sous-locations/vehicules/:id",
    guard,
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id)
      if (
        !(await repos.sousLocations.listVehicles()).some(
          (vehicle) => vehicle.id === id,
        )
      ) {
        throw notFound("Véhicule de sous-location introuvable")
      }
      try {
        if (!(await repos.sousLocations.removeVehicle(id))) {
          throw conflict(
            "Ce véhicule est lié à des sous-locations ou à des mouvements et ne peut pas être supprimé.",
          )
        }
      } catch (error) {
        if (isForeignKeyError(error)) {
          throw conflict(
            "Ce véhicule est lié à des sous-locations ou à des mouvements et ne peut pas être supprimé.",
          )
        }
        throw error
      }
      res.status(204).end()
    }),
  )

  router.put(
    "/locations/sous-locations/:id",
    [...guard, validateBody(sousLocationUpdateSchema)],
    asyncHandler(async (req, res) => {
      const id = idParam(req.params.id)
      const input = sousLocationUpdateSchema.parse(req.body)
      const current = (await repos.sousLocations.list()).find(
        (location) => location.id === id,
      )
      if (!current) throw notFound("Sous-location introuvable")

      const [client, commercial] = await Promise.all([
        repos.clients.get(input.clientId),
        input.commercialId
          ? repos.commerciaux.get(input.commercialId)
          : Promise.resolve(null),
      ])
      if (!client) throw notFound("Client introuvable")
      if (input.commercialId && !commercial) {
        throw notFound("Commercial introuvable ou désactivé")
      }

      const overlaps = await repos.sousLocations.overlapping(
        current.vehiculeSousLocationId,
        input.dateDebut,
        input.dateFin,
      )
      if (
        input.statut !== "TERMINEE" &&
        overlaps.some((location) => location.id !== id)
      ) {
        throw conflict(
          "Le véhicule de sous-location est déjà loué sur cette période.",
        )
      }

      let updated: Awaited<ReturnType<Repositories["sousLocations"]["update"]>>
      try {
        updated = await repos.sousLocations.update(id, input)
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw conflict("Cette référence de location est déjà utilisée.")
        }
        throw error
      }
      if (!updated) throw notFound("Sous-location introuvable")
      res.json(updated)
    }),
  )

  router.delete(
    "/locations/sous-locations/:id",
    guard,
    asyncHandler(async (req, res) => {
      if (!(await repos.sousLocations.remove(idParam(req.params.id)))) {
        throw notFound("Sous-location introuvable")
      }
      res.status(204).end()
    }),
  )

  router.post(
    "/locations",

    [...guard, validateBody(locationSchema)],

    asyncHandler(async (req, res) => {
      const { clientId, vehiculeId, commercialId } = req.body

      const [client, vehicle, commercial, maintenance] = await Promise.all([
        repos.clients.get(clientId),

        repos.vehicules.get(vehiculeId),

        repos.commerciaux.get(commercialId),

        repos.maintenances.overlapping(
          vehiculeId,
          req.body.dateDebut,
          req.body.dateFin,
        ),
      ])

      if (!client) throw notFound("Client introuvable")

      if (!vehicle) throw notFound("Véhicule introuvable")
      if (
        (req.body.statut ?? "EN_COURS") !== "TERMINEE" &&
        !canStartVehicleOperation(vehicle.statut)
      ) {
        throw conflict(
          `La location est autorisée uniquement pour un véhicule au statut ENTREE_PARC, RETOUR_LOCATION, RETOUR_GARAGE ou RETOUR_INTERNE. Statut actuel : ${vehicle.statut}.`,
        )
      }

      if (commercialId && !commercial)
        throw notFound("Commercial introuvable ou désactivé")

      if (maintenance.length)
        throw conflict(`Véhicule au garage : ${maintenance[0]!.motif}`)

      try {
        res
          .status(201)
          .json(await repos.locations.create(req.body, req.user!.id))
      } catch (error) {
        if (error instanceof AvailabilityConflictError)
          throw conflict(error.message)

        throw error
      }
    }),
  )

  const bind = (
    path: string,

    list: (q?: string, limit?: number) => Promise<unknown[]>,

    get: (id: number) => Promise<unknown | null>,

    label: string,
  ): void => {
    router.get(
      path,

      guard,

      asyncHandler(async (req, res) => {
        const { q, limit } = paginationSchema.parse(req.query)

        res.json(await list(q, limit))
      }),
    )

    router.get(
      `${path}/:id`,

      guard,

      asyncHandler(async (req, res) => {
        const row = await get(Number(req.params.id))

        if (!row) throw notFound(`${label} introuvable`)

        res.json(row)
      }),
    )
  }

  bind(
    "/clients",

    async (q, limit) => {
      const rows = await repos.clients.fiches()

      const needle = (q ?? "").trim().toLowerCase()

      const filtered = needle
        ? rows.filter((r) =>
            `${r.nom} ${r.type} ${r.telephone}`.toLowerCase().includes(needle),
          )
        : rows

      return limit ? filtered.slice(0, limit) : filtered
    },

    (id) => repos.clients.get(id),

    "Client",
  )

  bind(
    "/commerciaux",

    async (q, limit) => {
      const rows = await repos.commerciaux.fiches()

      const needle = (q ?? "").trim().toLowerCase()

      const filtered = needle
        ? rows.filter((r) =>
            `${r.nom} ${r.contact}`.toLowerCase().includes(needle),
          )
        : rows

      return limit ? filtered.slice(0, limit) : filtered
    },

    (id) => repos.commerciaux.get(id),

    "Commercial",
  )

  bind(
    "/locations",

    async (q, limit) => {
      const [rows, sousLocations, clients] = await Promise.all([
        repos.locations.fiches(),
        repos.sousLocations.list(),
        repos.clients.fiches(),
      ])
      const clientNames = new Map(
        clients.map((client) => [client.id, client.nom]),
      )
      const combined = [
        ...rows,
        ...sousLocations.map((location) => ({
          id: location.id,
          reference: location.reference,
          clientId: location.clientId,
          vehiculeId: null,
          vehiculeSousLocationId: location.vehiculeSousLocationId,
          commercialId: location.commercialId,
          type: location.type,
          dateDebut: location.dateDebut,
          dateFin: location.dateFin,
          dateRetourReelle: location.dateRetourReelle ?? null,
          kmDepart: 0,
          kmRetour: null,
          kmParcourus: null,
          montant: location.montant,
          statut: location.statut,
          observation: location.observation,
          modePaiement: location.modePaiement,
          referenceFacture: location.referenceFacture,
          dateFacturation: location.dateFacturation,
          paye: location.paye,
          payeImport: location.payeImport,
          datePaiement: location.datePaiement,
          client: clientNames.get(location.clientId) ?? "Client introuvable",
          vehicule: location.immatriculation,
          isSousLocation: true,
          immatriculation: location.immatriculation,
          sousLocationId: location.id,
        })),
      ]
      const needle = (q ?? "").trim().toLowerCase()
      const filtered = needle
        ? combined.filter((row) =>
            `${row.reference} ${row.client} ${row.vehicule} ${row.statut}`
              .toLowerCase()
              .includes(needle),
          )
        : combined
      return limit ? filtered.slice(0, limit) : filtered
    },

    (id) => repos.locations.get(id),

    "Location",
  )

  router.put(
    "/locations/:id",

    [...guard, validateBody(locationSchemaBase.partial())],

    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const current = await repos.locations.get(id)
      if (!current) throw notFound("Location introuvable")
      const nextVehicleId = req.body.vehiculeId ?? current.vehiculeId
      const nextStatus = req.body.statut ?? current.statut
      const newActiveAssignment =
        nextStatus !== "TERMINEE" &&
        (current.statut === "TERMINEE" || nextVehicleId !== current.vehiculeId)

      if (newActiveAssignment) {
        const vehicle = await repos.vehicules.get(nextVehicleId)
        if (!vehicle) throw notFound("Véhicule introuvable")
        if (!canStartVehicleOperation(vehicle.statut)) {
          throw conflict(
            `La location est autorisée uniquement pour un véhicule au statut ENTREE_PARC, RETOUR_LOCATION, RETOUR_GARAGE ou RETOUR_INTERNE. Statut actuel : ${vehicle.statut}.`,
          )
        }
      }

      const updated = await repos.locations.update(id, req.body)
      if (!updated) throw notFound("Location introuvable")

      res.json(updated)
    }),
  )

  router.delete(
    "/locations/:id",

    guard,

    asyncHandler(async (req, res) => {
      if (!(await repos.locations.remove(Number(req.params.id))))
        throw notFound("Location introuvable")

      res.status(204).end()
    }),
  )

  bind(
    "/reservations",

    async (q) => repos.reservations.fiches().then((rows) => {
        const needle = (q ?? "").trim().toLowerCase()

        return needle
          ? rows.filter((r) =>
              `${r.reference} ${r.client} ${r.statut}`
                .toLowerCase()
                .includes(needle),
            )
          : rows
      }),

    async (id) =>
      (await repos.reservations.fiches()).find(
        (reservation) => reservation.id === id,
      ) ?? null,

    "Réservation",
  )

  bind(
    "/maintenances",
    (q, limit) => repos.maintenances.list({ q, limit }),
    (id) => repos.maintenances.get(id),
    "Maintenance",
  )

  router.get(
    "/mouvements",

    guard,

    asyncHandler(async (req, res) => {
      const vehiculeId = req.query.vehiculeId
        ? Number(req.query.vehiculeId)
        : undefined

      res.json(await repos.mouvements.list(vehiculeId))
    }),
  )

  router.delete(
    "/mouvements/:id",

    guard,

    asyncHandler(async (req, res) => {
      const movementId = Number(req.params.id)
      const movement = (await repos.mouvements.list()).find(
        (item) => item.id === movementId,
      )
      if (movement?.sousLocationId != null) {
        throw conflict(
          "Un mouvement lié à une sous-location ne peut pas être supprimé séparément",
        )
      }

      if (await repos.ventesVehicules.isMovementLinked(movementId)) {
        throw conflict(
          "Un mouvement lié à une vente ou une location ne peut pas être supprimé séparément",
        )
      }

      const removed = await repos.mouvements.remove(movementId)

      if (!removed) throw notFound("Mouvement introuvable")

      res.status(204).end()
    }),
  )

  router.get(
    "/prolongations",
    guard,
    asyncHandler(async (_req, res) => {
      res.json(await repos.prolongations.list())
    }),
  )

  router.get(
    "/prolongations/:id",
    guard,
    asyncHandler(async (req, res) => {
      const row = await repos.prolongations.get(Number(req.params.id))

      if (!row) throw notFound("Prolongation introuvable")

      res.json(row)
    }),
  )

  router.post(
    "/prolongations",

    [...guard, validateBody(prolongationSchema)],

    asyncHandler(async (req, res) => {
      if (!(await repos.locations.get(req.body.locationId)))
        throw notFound("Location introuvable")

      res.status(201).json(await repos.prolongations.create(req.body))
    }),
  )

  router.put(
    "/prolongations/:id",

    [...guard, validateBody(prolongationSchema.partial())],

    asyncHandler(async (req, res) => {
      const row = await repos.prolongations.update(
        Number(req.params.id),
        req.body,
      )

      if (!row) throw notFound("Prolongation introuvable")

      res.json(row)
    }),
  )

  router.delete(
    "/prolongations/:id",
    guard,
    asyncHandler(async (req, res) => {
      if (!(await repos.prolongations.remove(Number(req.params.id))))
        throw notFound("Prolongation introuvable")

      res.status(204).end()
    }),
  )

  router.get(
    "/clients/:id/fiche",

    guard,

    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)

      const clients = await repos.clients.fiches()

      const fiche = clients.find((c) => c.id === id)

      if (!fiche) throw notFound("Client introuvable")

      const [locations, sousLocations] = await Promise.all([
        repos.locations.forClient(id),
        repos.sousLocations.list(),
      ])
      const clientSousLocations = sousLocations
        .filter((location) => location.clientId === id)
        .map((location) => ({
          id: location.id,
          reference: location.reference,
          clientId: location.clientId,
          vehiculeId: null,
          commercialId: location.commercialId,
          type: location.type,
          dateDebut: location.dateDebut,
          dateFin: location.dateFin,
          montant: location.montant,
          statut: location.statut,
          observation: location.observation,
          client: fiche.nom,
          vehicule: location.immatriculation,
          isSousLocation: true,
        }))

      res.json({
        ...fiche,
        locations: [...locations, ...clientSousLocations].sort((a, b) =>
          b.dateDebut.localeCompare(a.dateDebut),
        ),
      })
    }),
  )

  return router
}
