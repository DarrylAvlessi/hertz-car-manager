import { Router } from "express"
import type { Request } from "express"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { badRequest, notFound } from "../../lib/httpErrors.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { generateBilanPdf } from "./bilanRunner.js"
import { generateFichePdf } from "./ficheRunner.js"
import { buildBilanReport } from "../stats/bilanReport.js"
import { performanceOf } from "../../repositories/helpers.js"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"

function reportPeriod(req: Request) {
  if (
    (req.query.debut !== undefined && typeof req.query.debut !== "string") ||
    (req.query.fin !== undefined && typeof req.query.fin !== "string")
  ) {
    throw badRequest("Les dates de période doivent être uniques.")
  }
  const debut = typeof req.query.debut === "string" ? req.query.debut : undefined
  const fin = typeof req.query.fin === "string" ? req.query.fin : undefined
  if (Boolean(debut) !== Boolean(fin)) {
    throw badRequest("Renseignez les deux dates de la période, ou laissez-les vides.")
  }
  for (const date of [debut, fin]) {
    if (!date) continue
    const parsed = new Date(`${date}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw badRequest("Date de période invalide.")
    }
  }
  if (debut && fin && debut > fin) {
    throw badRequest("La date de début doit précéder la date de fin.")
  }
  return { debut, fin }
}

function inReportPeriod(value: string | null | undefined, debut?: string, fin?: string): boolean {
  if (!debut || !fin) return true
  if (!value) return false
  const date = value.slice(0, 10)
  return date >= debut && date <= fin
}

function filenameSlug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")
}

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
      const locations = (await repos.locations.forClient(id))
        .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut))
        .map((location) => ({
          ...location,
          statut: {
            EN_COURS: "En cours",
            TERMINEE: "Retourné",
            EN_RETARD: "En retard",
            EN_PROLONGATION: "En prolongation",
          }[location.statut],
        }))
      const pdf = await generateFichePdf({
        kind: "client",
        title: "Fiche client",
        issuedAt: new Date().toLocaleDateString("fr-FR"),
        client: fiche,
        locations,
      })
      res.setHeader("Content-Type", "application/pdf")
      const disposition = req.query.download === "true" ? "attachment" : "inline"
      res.setHeader("Content-Disposition", `${disposition}; filename="fiche-client-${filenameSlug(fiche.nom)}.pdf"`)
      res.setHeader("Content-Length", pdf.length)
      res.end(pdf)
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
      const { debut, fin } = reportPeriod(req)
      const [
        locations,
        reservations,
        movements,
        passages,
        sales,
        vehicles,
        clients,
      ] = await Promise.all([
        repos.locations.list(),
        repos.reservations.fiches(),
        repos.mouvements.list(),
        repos.passagesGarage.list(),
        repos.ventesVehicules.list(),
        repos.vehicules.list(),
        repos.clients.fiches(),
      ])
      const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
      const clientById = new Map(clients.map((client) => [client.id, client]))
      const activities = [
        ...locations
          .filter((row) => row.commercialId === id && inReportPeriod(row.dateDebut, debut, fin))
          .map((row) => ({
            type: "Location",
            reference: row.reference,
            date: row.dateDebut,
            vehicule: vehicleById.get(row.vehiculeId)?.immatriculation ?? "—",
            details: `${row.type} · Client : ${row.clientId === null ? "—" : clientById.get(row.clientId)?.nom ?? "—"}`,
            montant: row.montant,
            statut: row.statut,
          })),
        ...reservations
          .filter((row) => row.commercialId === id && inReportPeriod(row.dateReservation ?? row.dateDepart, debut, fin))
          .map((row) => ({
            type: "Réservation",
            reference: row.reference,
            date: row.dateReservation ?? row.dateDepart,
            vehicule: row.immatriculation,
            details: [row.client, row.mission, row.lieuMission].filter(Boolean).join(" · "),
            montant: null,
            statut: row.statut,
          })),
        ...movements
          .filter((row) => row.type === "ENVOI_GARAGE" && (row.commercialId === id || row.validateurId === id) && inReportPeriod(row.date, debut, fin))
          .map((row) => {
            const passage = passages.find((item) => item.id === row.passageId)
            return {
              type: "Envoi au garage",
              reference: passage ? `GAR-${passage.id}` : `MVT-${row.id}`,
              date: row.date,
              vehicule: vehicleById.get(row.vehiculeId)?.immatriculation ?? "—",
              details: [passage?.typePassage, passage?.garage, passage?.motif ?? row.motif ?? row.commentaire].filter(Boolean).join(" · "),
              montant: passage?.coutTotal ?? null,
              statut: passage
                ? {
                    EN_ATTENTE: "En attente",
                    EN_COURS: "En cours",
                    TERMINEE: "Terminé",
                  }[passage.statut]
                : "Enregistré",
            }
          }),
        ...movements
          .filter((row) => row.type === "SORTIE_INTERNE" && row.commercialId === id && inReportPeriod(row.date, debut, fin))
          .map((row) => ({
            type: "Sortie interne",
            reference: `MVT-${row.id}`,
            date: row.date,
            vehicule: vehicleById.get(row.vehiculeId)?.immatriculation ?? "—",
            details: row.motif ?? row.commentaire ?? "—",
            montant: null,
            statut: row.dateRetour ? "Retour enregistré" : "Sortie en cours",
          })),
        ...sales
          .filter((row) => row.commercialId === id && inReportPeriod(row.dateVente, debut, fin))
          .map((row) => ({
            type: "Vente",
            reference: row.numeroVente,
            date: row.dateVente,
            vehicule: vehicleById.get(row.vehiculeId)?.immatriculation ?? "—",
            details: `Acheteur : ${clientById.get(row.acheteurId)?.nom ?? `Client #${row.acheteurId}`} · ${row.motifVente}`,
            montant: row.prixVente,
            statut: `${row.statut === "CONCLUE" ? "Conclue" : "Annulée"} · ${row.statutPaiement === "PAYEE" ? "Payée" : row.statutPaiement === "PARTIELLE" ? "Partiellement payée" : "Non payée"}`,
          })),
      ].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
      const rentalActivities = activities.filter((activity) => activity.type === "Location")
      const reservationActivities = activities.filter((activity) => activity.type === "Réservation" && activity.statut !== "Annulée")
      const garageActivities = activities.filter((activity) => activity.type === "Envoi au garage")
      const internalExitActivities = activities.filter((activity) => activity.type === "Sortie interne")
      const salesActivities = activities.filter((activity) => activity.type === "Vente" && activity.statut.startsWith("Conclue"))
      const formatDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
      const periodLabel = debut && fin
        ? `${formatDate(debut)} au ${formatDate(fin)}`
        : "Toute la période"
      const pdf = await generateFichePdf({
        kind: "commercial",
        title: "Fiche de performance commerciale",
        issuedAt: new Date().toLocaleDateString("fr-FR"),
        period: periodLabel,
        commercial: {
          ...fiche,
          performance: performanceOf(rentalActivities.length),
        },
        summary: {
          locations: rentalActivities.length,
          reservations: reservationActivities.length,
          garages: garageActivities.length,
          internalExits: internalExitActivities.length,
          sales: salesActivities.length,
          rentalRevenue: rentalActivities.reduce((sum, row) => sum + (row.montant ?? 0), 0),
          saleRevenue: salesActivities.reduce((sum, row) => sum + (row.montant ?? 0), 0),
        },
        activities,
      })
      res.setHeader("Content-Type", "application/pdf")
      const periodSuffix = debut && fin ? `-${debut}-${fin}` : ""
      const disposition = req.query.download === "true" ? "attachment" : "inline"
      res.setHeader("Content-Disposition", `${disposition}; filename="fiche-commercial-${filenameSlug(fiche.nom)}${periodSuffix}.pdf"`)
      res.setHeader("Content-Length", pdf.length)
      res.end(pdf)
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
