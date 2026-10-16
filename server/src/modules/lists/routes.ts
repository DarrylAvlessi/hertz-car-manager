import { Router } from "express"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { notFound } from "../../lib/httpErrors.js"
import { paginationSchema, requireAuth, requireRole } from "../../middleware/auth.js"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"

// Listes + détail en lecture seule. Les opérations d'écriture appartiennent
// aux lots Abel (parc, mouvements, maintenance) et Prince (clients, locations,
// réservations) : ils ajouteront POST/PUT/DELETE en suivant le pattern du
// module vehicules (validation zod + codes 201/404/409).
export function listsRouter(repos: Repositories, env: Env): Router {
  const router = Router()
  const guard = [requireAuth(env.JWT_SECRET), requireRole("responsable", "admin")]

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
