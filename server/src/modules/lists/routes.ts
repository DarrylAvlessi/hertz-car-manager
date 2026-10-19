import { Router } from "express"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { badRequest, conflict, notFound } from "../../lib/httpErrors.js"
import { paginationSchema, requireAuth, requireRole, validateBody } from "../../middleware/auth.js"
import { z } from "zod"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"

// Listes + détail en lecture seule. Les opérations d'écriture appartiennent
// aux lots Abel (parc, mouvements, maintenance) et Prince (clients, locations,
// réservations) : ils ajouteront POST/PUT/DELETE en suivant le pattern du
// module vehicules (validation zod + codes 201/404/409).
export function listsRouter(repos: Repositories, env: Env): Router {
  const router = Router()
  const guard = [requireAuth(env.JWT_SECRET), requireRole("responsable", "admin")]
  const locationSchema = z.object({
    reference: z.string().trim().max(30).nullable().optional(),
    clientId: z.number().int().positive(),
    vehiculeId: z.number().int().positive(),
    commercialId: z.number().int().positive().nullable().optional(),
    type: z.enum(["Courte durée", "Longue durée"]),
    dateDebut: z.string().trim().min(10).max(25),
    dateFin: z.string().trim().min(10).max(25),
    montant: z.number().min(0).optional(),
    statut: z.enum(["EN_COURS", "TERMINEE", "EN_RETARD", "EN_PROLONGATION"]).optional(),
    prolongation: z.object({
      ancienneDateFin: z.string().trim().min(10).max(25).nullable().optional(),
      nouvelleDateFin: z.string().trim().min(10).max(25),
      dateDemande: z.string().trim().min(10).max(25),
      motif: z.string().trim().max(255).nullable().optional(),
      montantSupplementaire: z.number().min(0),
      commercialId: z.number().int().positive().nullable().optional(),
    }).optional(),
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

    router.delete(
      "/mouvements/:id",
      guard,
      asyncHandler(async (req, res) => {
        if (await repos.ventesVehicules.isMovementLinked(Number(req.params.id))) {
          throw conflict("Un mouvement lié à une vente ou une location ne peut pas être supprimé séparément")
        }
        const removed = await repos.mouvements.remove(Number(req.params.id))
        if (!removed) throw notFound("Mouvement introuvable")
        res.status(204).end()
      }),
    )
    router.get("/prolongations", guard, asyncHandler(async (_req, res) => {
      res.json(await repos.prolongations.list())
    }))
    router.get("/prolongations/:id", guard, asyncHandler(async (req, res) => {
      const row = await repos.prolongations.get(Number(req.params.id))
      if (!row) throw notFound("Prolongation introuvable")
      res.json(row)
    }))
    router.post(
      "/prolongations",
      [...guard, validateBody(prolongationSchema)],
      asyncHandler(async (req, res) => {
        if (!await repos.locations.get(req.body.locationId)) throw notFound("Location introuvable")
        res.status(201).json(await repos.prolongations.create(req.body))
      }),
    )
    router.put(
      "/prolongations/:id",
      [...guard, validateBody(prolongationSchema.partial())],
      asyncHandler(async (req, res) => {
        const row = await repos.prolongations.update(Number(req.params.id), req.body)
        if (!row) throw notFound("Prolongation introuvable")
        res.json(row)
      }),
    )
    router.delete("/prolongations/:id", guard, asyncHandler(async (req, res) => {
      if (!await repos.prolongations.remove(Number(req.params.id))) throw notFound("Prolongation introuvable")
      res.status(204).end()
    }))
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

  bind("/clients", (q, limit) => repos.clients.list({ q, limit }), (id) => repos.clients.get(id), "Client")
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
  router.post(
    "/locations",
    [...guard, validateBody(locationSchema)],
    asyncHandler(async (req, res) => {
      if (req.body.dateFin < req.body.dateDebut) throw badRequest("La date de fin doit être postérieure à la date de début")
      res.status(201).json(await repos.locations.create(req.body))
    }),
  )
  router.put(
    "/locations/:id",
    [...guard, validateBody(locationSchema.partial())],
    asyncHandler(async (req, res) => {
      const updated = await repos.locations.update(Number(req.params.id), req.body)
      if (!updated) throw notFound("Location introuvable")
      res.json(updated)
    }),
  )
  router.delete(
    "/locations/:id",
    guard,
    asyncHandler(async (req, res) => {
      if (!await repos.locations.remove(Number(req.params.id))) throw notFound("Location introuvable")
      res.status(204).end()
    }),
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
