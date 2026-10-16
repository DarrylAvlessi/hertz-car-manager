import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { badRequest, conflict, notFound } from "../../lib/httpErrors.js"
import { paginationSchema, requireAuth, requireRole, validateBody } from "../../middleware/auth.js"
import { addDays } from "../../repositories/helpers.js"
import type { Env } from "../../config/env.js"
import type { Repositories, VehiculeStatut } from "../../repositories/types.js"

const STATUTS: VehiculeStatut[] = ["Disponible", "En location", "Entretien", "Indisponible"]

const vehiculeSchema = z.object({
  immatriculation: z.string().trim().min(3).max(20),
  marqueModele: z.string().trim().min(2).max(120),
  categorie: z.string().trim().min(2).max(60),
  kilometrage: z.number().int().min(0),
  statut: z.enum(["Disponible", "En location", "Entretien", "Indisponible"]),
})

const vehiculePatchSchema = vehiculeSchema.partial()

const dispoSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ"),
})

export function vehiculesRouter(repos: Repositories, env: Env): Router {
  const router = Router()
  const guard = [requireAuth(env.JWT_SECRET), requireRole("responsable", "admin")]

  router.get(
    "/",
    guard,
    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)
      res.json(await repos.vehicules.list({ q, limit }))
    }),
  )

  router.get(
    "/:id",
    guard,
    asyncHandler(async (req, res) => {
      const row = await repos.vehicules.get(Number(req.params.id))
      if (!row) throw notFound("Véhicule introuvable")
      res.json(row)
    }),
  )

  // Règle métier (réutilisée par le tunnel Prince) : un véhicule est disponible
  // s'il n'est ni en entretien/garage, ni couvert par une location active ou une
  // réservation confirmée/en attente sur la période demandée.
  router.get(
    "/:id/disponibilite",
    guard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const { from, to } = dispoSchema.parse(req.query)
      if (from > to) throw badRequest("Période invalide : fin avant début")
      const vehicule = await repos.vehicules.get(id)
      if (!vehicule) throw notFound("Véhicule introuvable")
      if (vehicule.statut === "Entretien" || vehicule.statut === "Indisponible") {
        const garage = await repos.maintenances.openForVehicule(id)
        res.json({
          disponible: false,
          motif: garage ? `Au garage depuis le ${garage.dateEntree} (${garage.motif})` : `Statut : ${vehicule.statut}`,
        })
        return
      }
      const conflitsLocations = await repos.locations.overlapping(id, from, to)
      if (conflitsLocations.length > 0) {
        res.json({
          disponible: false,
          motif: `Déjà en location (${conflitsLocations[0]!.reference}) sur la période`,
        })
        return
      }
      const conflitsResas = await repos.reservations.overlapping(id, from, to)
      if (conflitsResas.length > 0) {
        res.json({
          disponible: false,
          motif: `Déjà réservé (${conflitsResas[0]!.reference}) sur la période`,
        })
        return
      }
      res.json({ disponible: true, motif: null })
    }),
  )

  router.post(
    "/",
    [...guard, validateBody(vehiculeSchema)],
    asyncHandler(async (req, res) => {
      const exists = await repos.vehicules.findByImmatriculation(req.body.immatriculation)
      if (exists) throw conflict("Immatriculation déjà enregistrée")
      const created = await repos.vehicules.create(req.body)
      res.status(201).json(created)
    }),
  )

  router.put(
    "/:id",
    [...guard, validateBody(vehiculePatchSchema)],
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      if (req.body.immatriculation) {
        const exists = await repos.vehicules.findByImmatriculation(req.body.immatriculation)
        if (exists && exists.id !== id) throw conflict("Immatriculation déjà enregistrée")
      }
      const updated = await repos.vehicules.update(id, req.body)
      if (!updated) throw notFound("Véhicule introuvable")
      res.json(updated)
    }),
  )

  router.delete(
    "/:id",
    guard,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const vehicule = await repos.vehicules.get(id)
      if (!vehicule) throw notFound("Véhicule introuvable")
      const [locs, resas] = await Promise.all([
        repos.locations.overlapping(id, "1900-01-01", "2100-12-31"),
        repos.reservations.overlapping(id, "1900-01-01", "2100-12-31"),
      ])
      const aujourdHui = new Date().toISOString().slice(0, 10)
      const resasEnCours = resas.filter((r) => addDays(r.dateDepart, r.dureeJours) >= aujourdHui)
      if (locs.length > 0 || resasEnCours.length > 0) {
        throw conflict("Véhicule lié à des locations ou réservations : suppression interdite")
      }
      await repos.vehicules.remove(id)
      res.status(204).end()
    }),
  )

  return router
}

export { STATUTS }
