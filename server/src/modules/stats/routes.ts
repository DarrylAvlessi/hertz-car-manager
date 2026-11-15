import { Router } from "express"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"
import { badRequest } from "../../lib/httpErrors.js"
import { buildBilanReport } from "./bilanReport.js"

export function statsRouter(repos: Repositories, env: Env): Router {
  const router = Router()
  const guard = [requireAuth(env.JWT_SECRET), requireRole("responsable", "admin")]

  router.get(
    "/overview",
    guard,
    asyncHandler(async (req, res) => {
      res.json(await repos.stats.overview({ debut: req.query.debut as string, fin: req.query.fin as string }))
    }),
  )

  router.get(
    "/monthly",
    guard,
    asyncHandler(async (req, res) => {
      res.json(await repos.stats.monthly({ debut: req.query.debut as string, fin: req.query.fin as string }))
    }),
  )

  router.get(
    "/daily",
    guard,
    asyncHandler(async (req, res) => {
      res.json(await repos.stats.daily({ debut: req.query.debut as string, fin: req.query.fin as string }))
    }),
  )

  router.get(
    "/fleet-status",
    guard,
    asyncHandler(async (_req, res) => {
      res.json(await repos.stats.fleetStatus())
    }),
  )

  router.get(
    "/bilan",
    guard,
    asyncHandler(async (req, res) => {
      if (req.query.agenceId !== undefined && typeof req.query.agenceId !== "string") {
        throw badRequest("L'identifiant de l'agence doit être unique.")
      }
      const agenceId =
        typeof req.query.agenceId === "string"
          ? Number(req.query.agenceId)
          : undefined
      if (
        agenceId !== undefined &&
        (!Number.isSafeInteger(agenceId) || agenceId <= 0)
      ) {
        throw badRequest("Identifiant d'agence invalide.")
      }
      res.json(
        await buildBilanReport(repos, {
          debut: typeof req.query.debut === "string" ? req.query.debut : undefined,
          fin: typeof req.query.fin === "string" ? req.query.fin : undefined,
          segment: typeof req.query.segment === "string" ? req.query.segment : undefined,
          agenceId,
        }),
      )
    }),
  )

  return router
}
