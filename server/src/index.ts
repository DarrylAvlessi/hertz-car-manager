import cors from "cors"
import express from "express"
import { loadEnv } from "./config/env.js"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js"
import { repositories } from "./repositories/index.js"
import { authRouter } from "./modules/auth/routes.js"
import { vehiculesRouter } from "./modules/vehicules/routes.js"
import { listsRouter } from "./modules/lists/routes.js"
import { statsRouter } from "./modules/stats/routes.js"
import { pdfRouter } from "./modules/pdf/routes.js"
import { parcRouter } from "./modules/parc/categoriesRoutes.js"
import { asyncHandler } from "./middleware/asyncHandler.js"

async function main(): Promise<void> {
  const env = loadEnv()
  const repos = await repositories(env)
  const refreshLocationStatuses = async () => {
    try {
      await repos.locations.refreshStatuses()
    } catch (error) {
      console.error("Mise à jour des statuts de location impossible :", error)
    }
  }
  await refreshLocationStatuses()
  const locationStatusTimer = setInterval(() => void refreshLocationStatuses(), 60_000)
  locationStatusTimer.unref()

  const app = express()
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()) }))
  app.use(express.json({ limit: "256kb" }))

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", driver: env.DB_DRIVER, at: new Date().toISOString() })
  })
  app.get(
    "/api/public/metrics",
    asyncHandler(async (_req, res) => {
      const vehicles = await repos.vehicules.list()
      res.json({ vehiclesTotal: vehicles.length })
    }),
  )

  app.use("/api/auth", authRouter(repos, env))
  app.use("/api/parc", parcRouter(repos, env))
  app.use("/api/vehicules", vehiculesRouter(repos, env))
  app.use("/api", listsRouter(repos, env))
  app.use("/api/stats", statsRouter(repos, env))
  app.use("/api/export", pdfRouter(repos, env))

  app.use(notFoundHandler)
  app.use(errorHandler)

  app.listen(env.PORT, () => {
    console.log(`hertz-server : http://localhost:${env.PORT} (driver=${env.DB_DRIVER})`)
  })
}

main().catch((err) => {
  console.error("Démarrage impossible :", err instanceof Error ? err.message : err)
  process.exit(1)
})
