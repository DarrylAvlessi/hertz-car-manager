import { Router } from "express"
import PDFDocument from "pdfkit"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { notFound } from "../../lib/httpErrors.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { ficheClient, ficheCommercial } from "./builders.js"
import { generateBilanPdf } from "./bilanRunner.js"
import { buildBilanReport } from "../stats/bilanReport.js"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"

export function pdfRouter(repos: Repositories, env: Env): Router {
  const router = Router()
  // Token accepté en header Bearer ou ?token= (téléchargement ou visualisation en nouvel onglet).
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
    "/commerciaux/:id/fiche",
    guard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const fiche = (await repos.commerciaux.fiches()).find(
        (item) => item.id === id,
      )
      if (!fiche) throw notFound("Commercial introuvable")
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="fiche-commercial-${fiche.nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-")}.pdf"`,
      )
      const doc = new PDFDocument({ margin: 50 })
      doc.pipe(res)
      ficheCommercial(doc, fiche)
      doc.end()
    }),
  )

  const handleBilanStatistique = asyncHandler(async (req, res) => {
    const debut = typeof req.query.debut === "string" ? req.query.debut : undefined
    const fin = typeof req.query.fin === "string" ? req.query.fin : undefined
    const segment = typeof req.query.segment === "string" ? req.query.segment : "LCD"
    const isDemo = req.query.demo === "true" || req.query.demo === "1"
    const isDownload = req.query.download === "true" || req.query.download === "1"

    const reportData = isDemo
      ? undefined
      : await buildBilanReport(repos, { debut, fin, segment })
    const pdfBuffer = await generateBilanPdf(
      { debut, fin, segment, demo: isDemo },
      reportData,
    )

    const disposition = isDownload ? "attachment" : "inline"
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="bilan_statistique_parc.pdf"`,
    )
    res.setHeader("Content-Length", pdfBuffer.length)
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
    res.end(pdfBuffer)
  })

  // Bilan Statistique conforme à bilan_statistique_parc_exemple.pdf (6 pages A4, Montserrat, 11 graphiques)
  router.get("/rapports/bilan-statistique", guard, handleBilanStatistique)
  router.get("/rapports/activite", guard, handleBilanStatistique)

  return router
}
