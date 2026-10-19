import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { conflict, notFound } from "../../lib/httpErrors.js"
import { requireAuth, requireRole, paginationSchema, validateBody } from "../../middleware/auth.js"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"

const categorySchema = z.object({
  libelle: z.string().trim().min(2).max(80),
  tarifJournalier: z.number().finite().min(0),
  tarifMensuel: z.number().finite().min(0).nullable(),
})

const modelSchema = z.object({
  marque: z.string().trim().min(2).max(60),
  nom: z.string().trim().min(1).max(80),
  nbPlaces: z.number().int().min(1).max(99).nullable(),
  categorieId: z.number().int().positive().nullable(),
})

const garageSchema = z.object({
  nom: z.string().trim().min(2).max(120),
  adresse: z.string().trim().max(255).nullable().optional(),
  telephone: z.string().trim().max(30).nullable().optional(),
})

const passageGarageSchema = z.object({
  typePassage: z.enum(["REPARATION", "REVISION", "ENTRETIEN", "VISITE_TECHNIQUE", "AUTRE"]),
  dateEntree: z.string().date(),
  dateSortiePrevue: z.string().date().nullable().optional(),
  dateSortieReelle: z.string().date().nullable().optional(),
  kmEntree: z.number().int().min(0).nullable().optional(),
  motif: z.string().trim().max(255).nullable().optional(),
  statut: z.enum(["EN_ATTENTE", "EN_COURS", "TERMINEE"]),
  coutTotal: z.number().min(0).optional(),
  vehiculeId: z.number().int().positive(),
  garageId: z.number().int().positive(),
  vehiculeRemplacementId: z.number().int().positive().nullable().optional(),
})

const reparationSchema = z.object({
  description: z.string().trim().min(1).max(255),
  cout: z.number().min(0),
})

export function parcRouter(repos: Repositories, env: Env): Router {
  const router = Router()
  const guard = [requireAuth(env.JWT_SECRET), requireRole("responsable", "admin")]

  router.get(
    "/centres",
    guard,
    asyncHandler(async (_req, res) => {
      res.json(await repos.centres.list())
    }),
  )

  router.get(
    "/categories",
    guard,
    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)
      res.json(await repos.categories.list({ q, limit }))
    }),
  )
  router.post(
    "/categories",
    [...guard, validateBody(categorySchema)],
    asyncHandler(async (req, res) => {
      const exists = (await repos.categories.list()).some(
        (row) => row.libelle.toLowerCase() === req.body.libelle.toLowerCase(),
      )
      if (exists) throw conflict("Cette catégorie existe déjà")
      res.status(201).json(await repos.categories.create(req.body))
    }),
  )
  router.put(
    "/categories/:id",
    [...guard, validateBody(categorySchema.partial())],
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const current = await repos.categories.get(id)
      if (!current) throw notFound("Catégorie introuvable")
      if (req.body.libelle) {
        const duplicate = (await repos.categories.list()).some(
          (row) => row.id !== id && row.libelle.toLowerCase() === req.body.libelle.toLowerCase(),
        )
        if (duplicate) throw conflict("Cette catégorie existe déjà")
      }
      res.json((await repos.categories.update(id, req.body))!)
    }),
  )
  router.delete(
    "/categories/:id",
    guard,
    asyncHandler(async (req, res) => {
      const removed = await repos.categories.remove(Number(req.params.id))
      if (!removed) throw notFound("Catégorie introuvable")
      res.status(204).end()
    }),
  )

  router.get(
    "/reparations",
    guard,
    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)
      res.json(await repos.reparations.list({ q, limit }))
    }),
  )
  router.put(
    "/reparations/:id",
    [...guard, validateBody(reparationSchema.partial())],
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      if (!(await repos.reparations.get(id))) throw notFound("Réparation introuvable")
      res.json((await repos.reparations.update(id, req.body))!)
    }),
  )
  router.delete(
    "/reparations/:id",
    guard,
    asyncHandler(async (req, res) => {
      if (!(await repos.reparations.remove(Number(req.params.id)))) {
        throw notFound("Réparation introuvable")
      }
      res.status(204).end()
    }),
  )

  router.get(
    "/passages-garage",
    guard,
    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)
      res.json(await repos.passagesGarage.list({ q, limit }))
    }),
  )
  router.put(
    "/passages-garage/:id",
    [...guard, validateBody(passageGarageSchema.partial())],
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      if (!(await repos.passagesGarage.get(id))) throw notFound("Passage garage introuvable")
      if (req.body.vehiculeId !== undefined && !(await repos.vehicules.get(req.body.vehiculeId))) throw notFound("Véhicule introuvable")
      if (req.body.garageId !== undefined && !(await repos.garages.get(req.body.garageId))) throw notFound("Garage introuvable")
      res.json((await repos.passagesGarage.update(id, req.body))!)
    }),
  )
  router.delete(
    "/passages-garage/:id",
    guard,
    asyncHandler(async (req, res) => {
      if (!(await repos.passagesGarage.remove(Number(req.params.id)))) throw notFound("Passage garage introuvable")
      res.status(204).end()
    }),
  )

  router.get(
    "/garages",
    guard,
    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)
      res.json(await repos.garages.list({ q, limit }))
    }),
  )
  router.post(
    "/garages",
    [...guard, validateBody(garageSchema)],
    asyncHandler(async (req, res) => {
      const exists = (await repos.garages.list()).some(
        (row) => row.nom.toLowerCase() === req.body.nom.toLowerCase(),
      )
      if (exists) throw conflict("Ce garage existe déjà")
      res.status(201).json(
        await repos.garages.create({
          nom: req.body.nom,
          adresse: req.body.adresse ?? null,
          telephone: req.body.telephone ?? null,
        }),
      )
    }),
  )
  router.put(
    "/garages/:id",
    [...guard, validateBody(garageSchema.partial())],
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const current = await repos.garages.get(id)
      if (!current) throw notFound("Garage introuvable")
      if (req.body.nom) {
        const duplicate = (await repos.garages.list()).some(
          (row) => row.id !== id && row.nom.toLowerCase() === req.body.nom.toLowerCase(),
        )
        if (duplicate) throw conflict("Ce garage existe déjà")
      }
      res.json((await repos.garages.update(id, req.body))!)
    }),
  )
  router.delete(
    "/garages/:id",
    guard,
    asyncHandler(async (req, res) => {
      try {
        const removed = await repos.garages.remove(Number(req.params.id))
        if (!removed) throw notFound("Garage introuvable")
        res.status(204).end()
      } catch (error) {
        if (error instanceof Error && error.message.includes("foreign key")) {
          throw conflict("Ce garage est utilisé par un passage garage et ne peut pas être supprimé")
        }
        throw error
      }
    }),
  )

  router.get(
    "/modeles",
    guard,
    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)
      res.json(await repos.modeles.list({ q, limit }))
    }),
  )
  router.post(
    "/modeles",
    [...guard, validateBody(modelSchema)],
    asyncHandler(async (req, res) => {
      const exists = (await repos.modeles.list()).some(
        (row) =>
          row.marque.toLowerCase() === req.body.marque.toLowerCase() &&
          row.nom.toLowerCase() === req.body.nom.toLowerCase(),
      )
      if (exists) throw conflict("Ce modèle existe déjà pour cette marque")
      if (req.body.categorieId !== null && !(await repos.categories.get(req.body.categorieId))) {
        throw notFound("Catégorie introuvable")
      }
      res.status(201).json(await repos.modeles.create(req.body))
    }),
  )
  router.put(
    "/modeles/:id",
    [...guard, validateBody(modelSchema.partial())],
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const current = await repos.modeles.get(id)
      if (!current) throw notFound("Modèle introuvable")
      const marque = req.body.marque ?? current.marque
      const nom = req.body.nom ?? current.nom
      const duplicate = (await repos.modeles.list()).some(
        (row) => row.id !== id && row.marque.toLowerCase() === marque.toLowerCase() && row.nom.toLowerCase() === nom.toLowerCase(),
      )
      if (duplicate) throw conflict("Ce modèle existe déjà pour cette marque")
      if (req.body.categorieId !== undefined && req.body.categorieId !== null && !(await repos.categories.get(req.body.categorieId))) {
        throw notFound("Catégorie introuvable")
      }
      res.json((await repos.modeles.update(id, req.body))!)
    }),
  )
  router.delete(
    "/modeles/:id",
    guard,
    asyncHandler(async (req, res) => {
      const removed = await repos.modeles.remove(Number(req.params.id))
      if (!removed) throw notFound("Modèle introuvable")
      res.status(204).end()
    }),
  )

  return router
}
