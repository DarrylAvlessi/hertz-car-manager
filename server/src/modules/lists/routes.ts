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
  parseCsvDocument,
} from "../../lib/csv.js"

import type {
  CommercialInput,
  LocationInput,
  ReservationImportInput,
  ReservationUpdateInput,
} from "../../repositories/types.js"

const clientSchema = z.object({
  nom: z.string().trim().min(1).max(150),

  prenom: z.string().trim().max(80).optional(),

  type: z.enum(["Particulier", "Entreprise", "Organisation"]),

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

function parseLocationCsvDate(value: string, endOfDay = false): string | null {
  const text = value.trim()
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const year = match ? Number(match[3]) : isoMatch ? Number(isoMatch[1]) : NaN
  const month = match ? Number(match[2]) : isoMatch ? Number(isoMatch[2]) : NaN
  const day = match ? Number(match[1]) : isoMatch ? Number(isoMatch[3]) : NaN
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  const time = endOfDay ? "T23:59:59" : "T00:00:00"
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}${time}`
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

function parseLocationCsv(
  csv: string,
  clients: Awaited<ReturnType<Repositories["clients"]["fiches"]>>,
  vehicles: Awaited<ReturnType<Repositories["vehicules"]["list"]>>,
  commercials: Awaited<ReturnType<Repositories["commerciaux"]["fiches"]>>,
): LocationInput[] {
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
  for (const client of clients) {
    clientsByName.set(normalizeCsvLookup(client.nom), client.id)
    if (client.prenom) {
      clientsByName.set(
        normalizeCsvLookup(`${client.prenom} ${client.nom}`),
        client.id,
      )
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
  const inputs: LocationInput[] = []
  const importedVehicles = new Map<number, Array<{
    debut: string
    fin: string
    line: number
  }>>()
  for (const { values, line } of rowsWithLine) {
    const rowErrors: string[] = []
    const clientName = get(values, "NOMDUCLIENT")
    const registration = get(values, "IMMATVEHICULE")
    const clientId = clientsByName.get(normalizeCsvLookup(clientName))
    const vehicle = vehiclesByRegistration.get(
      registration.replace(/[^a-z0-9]/gi, "").toUpperCase(),
    )
    const start = parseLocationCsvDate(get(values, "DEBUT"))
    const end = parseLocationCsvDate(get(values, "FIN"), true)
    const rawAmount = get(values, "MONTANT")
    const amount = parseLocationCsvAmount(rawAmount)
    const modePaiement = get(values, "MODEDEPAIEMENT")
    const referenceFacture = get(values, "REFFACTURE")
    const rawInvoiceDate = get(values, "DATEFACTURATION")
    const invoiceDate = rawInvoiceDate
      ? (parseLocationCsvDate(rawInvoiceDate)?.slice(0, 10) ?? null)
      : null
    const rawPaymentDate = get(values, "DATEDEPAIEMENT")
    const paymentDate = rawPaymentDate
      ? (parseLocationCsvDate(rawPaymentDate)?.slice(0, 10) ?? null)
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
    const observation = get(values, "OBSERVATION")

    if (!clientName) rowErrors.push("nom du client obligatoire")
    else if (!clientId) rowErrors.push(`client « ${clientName} » introuvable`)
    if (!registration) rowErrors.push("immatriculation obligatoire")
    else if (!vehicle)
      rowErrors.push(`véhicule « ${registration} » introuvable`)
    if (!start) rowErrors.push("date de début invalide (JJ/MM/AAAA)")
    if (!end) rowErrors.push("date de fin invalide (JJ/MM/AAAA)")
    if (start && end && end < start) {
      rowErrors.push("la date de fin précède la date de début")
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
    if (observation.length > 255) {
      rowErrors.push("observation limitée à 255 caractères")
    }

    if (rowErrors.length > 0) {
      errors.push(`Ligne ${line} : ${rowErrors.join(", ")}.`)
      continue
    }

    const previous = importedVehicles.get(vehicle!.id) ?? []
    if (
      previous.some(
        (candidate) => candidate.debut <= end! && start! <= candidate.fin,
      )
    ) {
      errors.push(
        `Ligne ${line} : chevauchement avec une autre ligne importée.`,
      )
      continue
    }

    previous.push({ debut: start!, fin: end!, line })
    importedVehicles.set(vehicle!.id, previous)
    inputs.push({
      clientId: clientId!,
      vehiculeId: vehicle!.id,
      commercialId,
      type: type!,
      dateDebut: start!,
      dateFin: end!,
      montant: amount!,
      statut: "EN_COURS",
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
  const parsed = parseLocationCsvDate(value)
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
    clientByName.set(normalizeCsvLookup(client.nom), client.id)
    if (client.prenom) {
      clientByName.set(
        normalizeCsvLookup(`${client.prenom} ${client.nom}`),
        client.id,
      )
      clientByName.set(
        normalizeCsvLookup(`${client.nom} ${client.prenom}`),
        client.id,
      )
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
    const clientId = clientByName.get(normalizeCsvLookup(clientName))
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
        clientImport: clientName || null,
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

  if (
    !headers ||
    headers.length !== COMMERCIAL_CSV_HEADERS.length ||
    headers.some((header, index) => header !== COMMERCIAL_CSV_HEADERS[index])
  ) {
    throw badRequest(
      "En-têtes CSV invalides. Colonnes attendues dans cet ordre : Prénom, NOM, Abréviations, Agence, Code Agence, Telephone, Email.",
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
      "Le fichier ne contient aucun commercial à importer. Remplacez les lignes dont le prénom commence par « EXEMPLE ».",
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
    if (values.length !== COMMERCIAL_CSV_HEADERS.length) {
      errors.push(
        `Ligne ${line} : ${COMMERCIAL_CSV_HEADERS.length} colonnes attendues, ${values.length} reçues.`,
      )

      continue
    }

    const [
      prenom,
      nom,
      rawAbbreviation,
      rawAgencyName,
      rawAgencyCode,
      telephone,
      email,
    ] = values.map((value) => value.trim())

    const rowErrors: string[] = []

    if (!prenom) rowErrors.push("prénom manquant")
    else if (prenom.length > 80) rowErrors.push("prénom limité à 80 caractères")

    if (!nom) rowErrors.push("nom manquant")
    else if (nom.length > 80) rowErrors.push("nom limité à 80 caractères")

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

      prenom,

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
      message: "La date de retour doit être après ou égale à la date de départ.",
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
          message: "Le kilométrage de retour est obligatoire pour une location terminée.",
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
      if (!(await repos.commerciaux.deactivate(idParam(req.params.id)))) {
        throw notFound("Commercial introuvable ou déjà désactivé")
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

      try {
        const created = await repos.reservations.importMany(
          rows.map(({ input }) => input),
        )
        res.status(201).json({
          created,
          unresolvedClients: rows.filter(
            ({ input }) => input.clientId === null && input.clientImport,
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
      if (input.clientId !== null && !client) throw notFound("Client introuvable")
      if (input.commercialId !== null && !commercial) {
        throw notFound("Commercial introuvable ou désactivé")
      }
      if (maintenance.length) {
        throw conflict(`Véhicule au garage : ${maintenance[0]!.motif}`)
      }
      try {
        const updated = await repos.reservations.update(
          idParam(req.params.id),
          input,
        )
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
    "/locations/import-csv",

    [...guard, validateBody(locationCsvSchema)],

    asyncHandler(async (req, res) => {
      const [clients, vehicles, commercials] = await Promise.all([
        repos.clients.fiches(),
        repos.vehicules.list(),
        repos.commerciaux.fiches(),
      ])
      const inputs = parseLocationCsv(
        req.body.csv,
        clients,
        vehicles,
        commercials,
      )
      const errors: string[] = []

      for (const [index, input] of inputs.entries()) {
        const line = Number(input.reference?.split("-").at(-1)) || index + 2
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
            `Ligne ${line} : le véhicule est déjà réservé sur cette période.`,
          )
        }
        if (maintenance.length > 0) {
          errors.push(
            `Ligne ${line} : véhicule au garage (${maintenance[0]!.motif}).`,
          )
        }
      }

      if (errors.length > 0) {
        throw conflict(
          `Import annulé : ${errors.length} conflit(s).\n${errors.slice(0, 20).join("\n")}`,
        )
      }

      const created = []
      for (const input of inputs) {
        try {
          created.push(await repos.locations.create(input, req.user!.id))
        } catch (error) {
          if (error instanceof AvailabilityConflictError) {
            throw conflict(`Import interrompu : ${error.message}`)
          }
          throw error
        }
      }

      res.status(201).json({ created: created.length })
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

    async (q, limit) => repos.locations.fiches(limit).then((rows) => {
        const needle = (q ?? "").trim().toLowerCase()

        return needle
          ? rows.filter((r) =>
              `${r.reference} ${r.client} ${r.vehicule} ${r.statut}`
                .toLowerCase()
                .includes(needle),
            )
          : rows
      }),

    (id) => repos.locations.get(id),

    "Location",
  )

  router.put(
    "/locations/:id",

    [...guard, validateBody(locationSchemaBase.partial())],

    asyncHandler(async (req, res) => {
      const updated = await repos.locations.update(
        Number(req.params.id),
        req.body,
      )

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
      if (await repos.ventesVehicules.isMovementLinked(Number(req.params.id))) {
        throw conflict(
          "Un mouvement lié à une vente ou une location ne peut pas être supprimé séparément",
        )
      }

      const removed = await repos.mouvements.remove(Number(req.params.id))

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

      res.json({ ...fiche, locations: await repos.locations.forClient(id) })
    }),
  )

  return router
}
