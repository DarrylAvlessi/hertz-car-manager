import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { badRequest, conflict, notFound } from "../../lib/httpErrors.js"
import { paginationSchema, requireAuth, requireRole, validateBody } from "../../middleware/auth.js"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"
import { AvailabilityConflictError } from "../../repositories/helpers.js"

const clientSchema = z.object({
  nom: z.string().trim().min(1).max(150),
  prenom: z.string().trim().max(80).optional(),
  type: z.enum(["Particulier", "Entreprise", "Organisation"]),
  telephone: z.string().trim().min(1).max(30),
  email: z.union([z.string().trim().email().max(120), z.literal("")]).optional(),
  adresse: z.string().trim().max(255).optional(),
  numPermis: z.string().trim().max(50).optional(),
})

const commercialSchema = z.object({
  nom: z.string().trim().min(1).max(80),
  prenom: z.string().trim().max(80).optional(),
  abreviation: z.string().trim().max(10).optional(),
  telephone: z.string().trim().max(30).optional(),
  email: z.union([z.string().trim().email().max(120), z.literal("")]).optional(),
})

const dateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, "Date invalide (format AAAA-MM-JJ)")

const reservationSchema = z
  .object({
    clientId: z.number().int().positive(),
    vehiculeId: z.number().int().positive(),
    commercialId: z.number().int().positive(),
    dateDepart: dateSchema,
    dateFin: dateSchema,
  })
  .refine((input) => input.dateFin >= input.dateDepart, {
    message: "La date de fin doit être après ou égale à la date de départ",
    path: ["dateFin"],
  })

const locationSchema = z
  .object({
    clientId: z.number().int().positive(),
    vehiculeId: z.number().int().positive(),
    commercialId: z.number().int().positive(),
    type: z.enum(["Courte durée", "Longue durée"]),
    dateDebut: dateSchema,
    dateFin: dateSchema,
    montant: z.number().finite().min(0),
  })
  .refine((input) => input.dateFin >= input.dateDebut, {
    message: "La date de fin doit être après ou égale à la date de début",
    path: ["dateFin"],
  })

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
    (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_NO_REFERENCED_ROW_2")
  )
}

function idParam(value: string): number {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw badRequest("Identifiant invalide")
  return id
}

// Listes + détails et création client. Les autres écritures métier restent
// dans les modules dédiés de chaque lot.
export function listsRouter(repos: Repositories, env: Env): Router {
  const router = Router()
  const guard = [requireAuth(env.JWT_SECRET), requireRole("responsable", "admin")]

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
      const updated = await repos.clients.update(idParam(req.params.id), req.body)
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
        if (!(await repos.clients.remove(id))) throw notFound("Client introuvable")
      } catch (error) {
        if (isForeignKeyError(error)) {
          throw conflict("Client associé à des locations ou réservations : suppression interdite")
        }
        throw error
      }
      res.status(204).end()
    }),
  )

  router.post(
    "/commerciaux",
    [...guard, validateBody(commercialSchema)],
    asyncHandler(async (req, res) => {
      try {
        res.status(201).json(await repos.commerciaux.create(req.body, req.user!.id))
      } catch (error) {
        if (isDuplicateKeyError(error)) throw conflict("E-mail ou abréviation déjà utilisé")
        throw error
      }
    }),
  )
  router.put(
    "/commerciaux/:id",
    [...guard, validateBody(commercialSchema)],
    asyncHandler(async (req, res) => {
      try {
        const updated = await repos.commerciaux.update(idParam(req.params.id), req.body)
        if (!updated) throw notFound("Commercial introuvable")
        res.json(updated)
      } catch (error) {
        if (isDuplicateKeyError(error)) throw conflict("E-mail ou abréviation déjà utilisé")
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
        repos.clients.get(clientId),
        repos.vehicules.get(vehiculeId),
        repos.commerciaux.get(commercialId),
        repos.maintenances.overlapping(vehiculeId, req.body.dateDepart, req.body.dateFin),
      ])
      if (!client) throw notFound("Client introuvable")
      if (!vehicle) throw notFound("Véhicule introuvable")
      if (!commercial) throw notFound("Commercial introuvable ou désactivé")
      if (maintenance.length) throw conflict(`Véhicule au garage : ${maintenance[0]!.motif}`)
      try {
        res.status(201).json(await repos.reservations.create(req.body))
      } catch (error) {
        if (error instanceof AvailabilityConflictError) throw conflict(error.message)
        throw error
      }
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
        repos.maintenances.overlapping(vehiculeId, req.body.dateDebut, req.body.dateFin),
      ])
      if (!client) throw notFound("Client introuvable")
      if (!vehicle) throw notFound("Véhicule introuvable")
      if (!commercial) throw notFound("Commercial introuvable ou désactivé")
      if (maintenance.length) throw conflict(`Véhicule au garage : ${maintenance[0]!.motif}`)
      try {
        res.status(201).json(await repos.locations.create(req.body, req.user!.id))
      } catch (error) {
        if (error instanceof AvailabilityConflictError) throw conflict(error.message)
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
        ? rows.filter((r) => `${r.nom} ${r.type} ${r.telephone}`.toLowerCase().includes(needle))
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
        ? rows.filter((r) => `${r.nom} ${r.contact}`.toLowerCase().includes(needle))
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
            `${r.reference} ${r.client} ${r.vehicule} ${r.statut}`.toLowerCase().includes(needle),
          )
        : rows
    }),
    (id) => repos.locations.get(id),
    "Location",
  )
  bind(
    "/reservations",
    async (q) => repos.reservations.fiches().then((rows) => {
      const needle = (q ?? "").trim().toLowerCase()
      return needle
        ? rows.filter((r) =>
            `${r.reference} ${r.client} ${r.statut}`.toLowerCase().includes(needle),
          )
        : rows
    }),
    (id) => repos.reservations.get(id),
    "Réservation",
  )
  bind("/maintenances", (q, limit) => repos.maintenances.list({ q, limit }), (id) => repos.maintenances.get(id), "Maintenance")

  router.get(
    "/mouvements",
    guard,
    asyncHandler(async (req, res) => {
      const vehiculeId = req.query.vehiculeId ? Number(req.query.vehiculeId) : undefined
      res.json(await repos.mouvements.list(vehiculeId))
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
