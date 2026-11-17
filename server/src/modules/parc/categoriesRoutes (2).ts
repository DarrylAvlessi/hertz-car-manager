import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { badRequest, conflict, notFound } from "../../lib/httpErrors.js"
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

const centreSchema = z.object({
  nom: z.string().trim().min(2).max(120),
  typeCentre: z.enum(["SOCIETE", "CLIENT", "PERSONNE", "AUTRE"]),
  clientId: z.number().int().positive().nullable(),
})

const conducteurSchema = z.object({
  nom: z.string().trim().min(2).max(120),
  prenom: z.string().trim().max(80).nullable().optional(),
  telephone: z.string().trim().max(30).nullable().optional(),
  numPermis: z.string().trim().max(50).nullable().optional(),
  categorie: z.enum(["CLIENT", "CHAUFFEUR_HERTZ", "EMPLOYE_HERTZ", "AUTRE"]),
  clientId: z.number().int().positive().nullable().optional(),
})

const agencySchema = z.object({
  code: z.string().trim().min(2).max(10).transform((value) => value.toUpperCase()),
  nom: z.string().trim().min(2).max(100),
  adresse: z.string().trim().max(255).nullable(),
  telephone: z.string().trim().max(30).nullable(),
  actif: z.boolean(),
})

const garageSchema = z.object({
  nom: z.string().trim().min(2).max(120),
  adresse: z.string().trim().max(255).nullable().optional(),
  telephone: z.string().trim().max(30).nullable().optional(),
})

const passageGarageDateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/,
    "Date de passage garage invalide",
  )

const passageGarageSchema = z.object({
  typePassage: z.enum(["REPARATION", "REVISION", "ENTRETIEN", "VISITE_TECHNIQUE", "AUTRE"]),
  dateEntree: passageGarageDateSchema,
  dateSortiePrevue: passageGarageDateSchema.nullable().optional(),
  dateSortieReelle: passageGarageDateSchema.nullable().optional(),
  kmEntree: z.number().int().min(0).nullable().optional(),
  kmSortie: z.number().int().min(0).nullable().optional(),
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
  router.post(
    "/centres",
    [...guard, validateBody(centreSchema)],
    asyncHandler(async (req, res) => {
      const exists = (await repos.centres.list()).some(
        (row) => row.nom.toLocaleLowerCase("fr") === req.body.nom.toLocaleLowerCase("fr"),
      )
      if (exists) throw conflict("Ce centre existe déjà")
      if (req.body.clientId !== null && !(await repos.clients.get(req.body.clientId))) {
        throw notFound("Client associé introuvable")
      }
      res.status(201).json(await repos.centres.create(req.body))
    }),
  )
  router.put(
    "/centres/:id",
    [...guard, validateBody(centreSchema.partial())],
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const current = await repos.centres.get(id)
      if (!current) throw notFound("Centre introuvable")
      const nom = req.body.nom ?? current.nom
      const duplicate = (await repos.centres.list()).some(
        (row) => row.id !== id && row.nom.toLocaleLowerCase("fr") === nom.toLocaleLowerCase("fr"),
      )
      if (duplicate) throw conflict("Ce centre existe déjà")
      if (req.body.clientId !== undefined && req.body.clientId !== null &&
        !(await repos.clients.get(req.body.clientId))) {
        throw notFound("Client associé introuvable")
      }
      res.json((await repos.centres.update(id, req.body))!)
    }),
  )
  router.delete(
    "/centres/:id",
    guard,
    asyncHandler(async (req, res) => {
      try {
        const removed = await repos.centres.remove(Number(req.params.id))
        if (!removed) throw notFound("Centre introuvable")
        res.status(204).end()
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ER_ROW_IS_REFERENCED_2"
        ) {
          throw conflict("Ce centre est utilisé par un véhicule et ne peut pas être supprimé")
        }
        if (error instanceof Error && error.message.includes("foreign key constraint")) {
          throw conflict("Ce centre est utilisé par un véhicule et ne peut pas être supprimé")
        }
        throw error
      }
    }),
  )

  router.get(
    "/conducteurs",
    guard,
    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)
      res.json(await repos.conducteurs.list({ q, limit }))
    }),
  )
  router.post(
    "/conducteurs",
    [...guard, validateBody(conducteurSchema)],
    asyncHandler(async (req, res) => {
      if (req.body.clientId !== undefined && req.body.clientId !== null &&
        !(await repos.clients.get(req.body.clientId))) {
        throw notFound("Client associé introuvable")
      }
      res.status(201).json(await repos.conducteurs.create(req.body))
    }),
  )
  router.put(
    "/conducteurs/:id",
    [...guard, validateBody(conducteurSchema.partial())],
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      if (req.body.clientId !== undefined && req.body.clientId !== null &&
        !(await repos.clients.get(req.body.clientId))) {
        throw notFound("Client associé introuvable")
      }
      const updated = await repos.conducteurs.update(id, req.body)
      if (!updated) throw notFound("Conducteur introuvable")
      res.json(updated)
    }),
  )
  router.delete(
    "/conducteurs/:id",
    guard,
    asyncHandler(async (req, res) => {
      if (!(await repos.conducteurs.remove(Number(req.params.id)))) {
        throw notFound("Conducteur introuvable")
      }
      res.status(204).end()
    }),
  )

  router.get(
    "/agences",
    guard,
    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)
      res.json(await repos.agences.list({ q, limit }))
    }),
  )
  router.post(
    "/agences",
    [...guard, validateBody(agencySchema)],
    asyncHandler(async (req, res) => {
      const agencies = await repos.agences.list()
      if (agencies.some((row) => row.code.toUpperCase() === req.body.code)) {
        throw conflict("Ce code agence existe déjà")
      }
      if (agencies.some((row) => row.nom.toLocaleLowerCase("fr") === req.body.nom.toLocaleLowerCase("fr"))) {
        throw conflict("Ce nom d’agence existe déjà")
      }
      res.status(201).json(await repos.agences.create(req.body))
    }),
  )
  router.put(
    "/agences/:id",
    [...guard, validateBody(agencySchema.partial())],
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const current = await repos.agences.get(id)
      if (!current) throw notFound("Agence introuvable")
      const agencies = await repos.agences.list()
      const code = req.body.code ?? current.code
      const nom = req.body.nom ?? current.nom
      if (agencies.some((row) => row.id !== id && row.code.toUpperCase() === code.toUpperCase())) {
        throw conflict("Ce code agence existe déjà")
      }
      if (agencies.some(
        (row) => row.id !== id && row.nom.toLocaleLowerCase("fr") === nom.toLocaleLowerCase("fr"),
      )) {
        throw conflict("Ce nom d’agence existe déjà")
      }
      res.json((await repos.agences.update(id, req.body))!)
    }),
  )
  router.delete(
    "/agences/:id",
    guard,
    asyncHandler(async (req, res) => {
      try {
        const removed = await repos.agences.remove(Number(req.params.id))
        if (!removed) throw notFound("Agence introuvable")
        res.status(204).end()
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ER_ROW_IS_REFERENCED_2"
        ) {
          throw conflict("Cette agence est utilisée et ne peut pas être supprimée.")
        }
        throw error
      }
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
      const current = await repos.passagesGarage.get(id)
      if (!current) throw notFound("Passage garage introuvable")
      if (req.body.statut === "TERMINEE") {
        if (req.body.kmSortie === undefined || req.body.kmSortie === null) {
          throw badRequest("Le kilométrage de retour est obligatoire pour terminer le passage.")
        }
        if (current.kmEntree !== null && req.body.kmSortie < current.kmEntree) {
          throw badRequest("Le kilométrage de retour ne peut pas être inférieur au kilométrage d'entrée.")
        }
      }
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
