import { Router } from "express"
import PDFDocument from "pdfkit"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { notFound } from "../../lib/httpErrors.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { ficheClient, rapportActivite } from "./builders.js"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"

export function pdfRouter(repos: Repositories, env: Env): Router {
  const router = Router()
  // Token accepté en header Bearer ou ?token= (téléchargement en nouvel onglet).
  const guard = [requireAuth(env.JWT_SECRET), requireRole("responsable", "admin")]

  router.get(
    "/clients/:id/fiche",
    guard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const fiches = await repos.clients.fiches()
      const fiche = fiches.find((c) => c.id === id)
      if (!fiche) throw notFound("Client introuvable")
      const locations = await repos.locations.forClient(id)
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="fiche-client-${fiche.nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-")}.pdf"`,
      )
      const doc = new PDFDocument({ margin: 50 })
      doc.pipe(res)
      ficheClient(doc, fiche, locations)
      doc.end()
    }),
  )

  router.get(
    "/rapports/activite",
    guard,
    asyncHandler(async (req, res) => {
      const debut = typeof req.query.debut === "string" ? req.query.debut : "2025-01-01"
      const fin = typeof req.query.fin === "string" ? req.query.fin : "2025-06-30"
      const [stats, monthly] = await Promise.all([repos.stats.overview(), repos.stats.monthly()])
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Disposition", 'attachment; filename="rapport-activite.pdf"')
      const doc = new PDFDocument({ margin: 50 })
      doc.pipe(res)
      rapportActivite(doc, `${debut} → ${fin}`, stats, monthly)
      doc.end()
    }),
  )

  return router
}
