import { Router } from "express"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"

export function statsRouter(repos: Repositories, env: Env): Router {
  const router = Router()
  const guard = [requireAuth(env.JWT_SECRET), requireRole("responsable", "admin")]

  router.get(
    "/overview",
    guard,
    asyncHandler(async (_req, res) => {
      res.json(await repos.stats.overview())
    }),
  )

  router.get(
    "/monthly",
    guard,
    asyncHandler(async (_req, res) => {
      res.json(await repos.stats.monthly())
    }),
  )

  return router
}
