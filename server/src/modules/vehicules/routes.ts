import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { badRequest, conflict, notFound } from "../../lib/httpErrors.js"
import { paginationSchema, requireAuth, requireRole, validateBody } from "../../middleware/auth.js"
import type { Env } from "../../config/env.js"
import type { Repositories, VehiculeStatut } from "../../repositories/types.js"

const STATUTS: VehiculeStatut[] = [
  "ENTREE_PARC",
  "MISE_EN_LOCATION",
  "RETOUR_LOCATION",
  "SORTIE_INTERNE",
  "RETOUR_INTERNE",
  "ENVOI_GARAGE",
  "RETOUR_GARAGE",
  "SORTIE_DEFINITIVE",
  "RESERVATION",
]

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_ROW_IS_REFERENCED_2"
  )
}

const STATUTS_SUPPRIMABLES: ReadonlySet<VehiculeStatut> = new Set([
  "ENTREE_PARC",
  "RETOUR_LOCATION",
  "RETOUR_INTERNE",
  "RETOUR_GARAGE",
  "SORTIE_DEFINITIVE",
])

const statutSchema = z.object({
  statut: z.enum([
    "ENTREE_PARC",
    "MISE_EN_LOCATION",
    "RETOUR_LOCATION",
    "SORTIE_INTERNE",
    "RETOUR_INTERNE",
    "ENVOI_GARAGE",
    "RETOUR_GARAGE",
    "SORTIE_DEFINITIVE",
    "RESERVATION",
  ]),
  observation: z.string().trim().max(255).optional(),
  garageId: z.number().int().positive().optional(),
  typePassage: z.enum(["REPARATION", "REVISION", "ENTRETIEN", "VISITE_TECHNIQUE", "AUTRE"]).optional(),
  motif: z.string().trim().max(255).nullable().optional(),
  typeLocation: z.enum(["Courte durée", "Longue durée"]).optional(),
  clientId: z.number().int().positive().optional(),
  commercialId: z.number().int().positive().optional(),
  dateDebut: z.string().trim().min(16).max(25).optional(),
  dateFin: z.string().trim().min(16).max(25).optional(),
}).superRefine((value, ctx) => {
  if (value.statut === "MISE_EN_LOCATION") {
    for (const field of ["typeLocation", "clientId", "commercialId", "dateDebut", "dateFin"] as const) {
      if (value[field] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Champ requis pour une mise en location" })
    }
    if (value.dateDebut && value.dateFin && value.dateFin <= value.dateDebut) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateFin"], message: "La fin doit être postérieure au début" })
    }
  }
})

const vehiculeFields = {
  immatriculation: z.string().trim().min(3).max(20),
  marque: z.string().trim().min(2).max(60),
  modele: z.string().trim().min(1).max(80),
  categorieId: z.number().int().positive().nullable().optional(),
  version: z.string().trim().max(60).nullable().optional(),
  annee: z.number().int().min(1900).max(2200).nullable().optional(),
  numeroChassis: z.string().trim().max(40).nullable().optional(),
  couleur: z.string().trim().max(30).nullable().optional(),
  carburant: z.enum(["ESSENCE", "DIESEL", "HYBRIDE", "ELECTRIQUE"]).nullable().optional(),
  nbPlaces: z.number().int().min(1).max(99).nullable().optional(),
  kilometrage: z.number().int().min(0),
  segmentParc: z.enum(["LCD", "LLD", "LEASING", "IMPRO", "AUTRE"]),
  groupeGeolocalisation: z.string().trim().max(80).nullable().optional(),
  centreId: z.number().int().positive().nullable().optional(),
  dateMiseEnService: z.string().date().nullable().optional(),
  dateEntreeParc: z.string().date().nullable().optional(),
  prixAchat: z.number().finite().min(0).nullable().optional(),
  dateAchat: z.string().date().nullable().optional(),
  dateProchaineVisiteTechnique: z.string().date().nullable().optional(),
  dateExpirationAssurance: z.string().date().nullable().optional(),
  observation: z.string().trim().max(255).nullable().optional(),
}

const vehiculeSchema = z.object(vehiculeFields).superRefine((value, ctx) => {
  if (value.dateEntreeParc && value.dateMiseEnService && value.dateMiseEnService < value.dateEntreeParc) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateMiseEnService"], message: "La mise en service ne peut pas précéder l'entrée au parc" })
  }
})

const vehiculePatchSchema = z.object(vehiculeFields).partial()

const venteSchema = z.object({
  numeroVente: z.string().trim().min(1).max(30),
  vehiculeId: z.number().int().positive(),
  acheteurId: z.number().int().positive(),
  dateVente: z.string().date(),
  prixVente: z.number().finite().min(0),
  devise: z.string().trim().length(3).default("XOF"),
  fraisVente: z.number().finite().min(0).default(0),
  motifVente: z.enum(["RENOUVELLEMENT_PARC", "COUT_ENTRETIEN_ELEVE", "FIN_CONTRAT", "ACCIDENT", "BESOIN_TRESORERIE", "AUTRE"]),
  etatVehicule: z.enum(["BON", "MOYEN", "MAUVAIS", "ACCIDENTE", "EPAVE", "POUR_PIECES"]),
  kilometrageVente: z.number().int().min(0),
  canalVente: z.enum(["PARTICULIER", "GARAGE_PROFESSIONNEL", "ENCHERES", "CLIENT_LOCATION", "APPEL_OFFRES", "AUTRE"]).nullable().optional(),
  statutPaiement: z.enum(["NON_PAYEE", "PARTIELLE", "PAYEE"]).default("NON_PAYEE"),
  dateRemiseVehicule: z.string().date().nullable().optional(),
  referenceCession: z.string().trim().max(60).nullable().optional(),
  factureId: z.number().int().positive().nullable().optional(),
  commercialId: z.number().int().positive().nullable().optional(),
  observation: z.string().trim().max(255).nullable().optional(),
})

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
    "/ventes",
    guard,
    asyncHandler(async (req, res) => {
      const { q, limit } = paginationSchema.parse(req.query)
      res.json(await repos.ventesVehicules.list({ q, limit }))
    }),
  )

  router.post(
    "/ventes",
    [...guard, validateBody(venteSchema)],
    asyncHandler(async (req, res) => {
      const vehicle = await repos.vehicules.get(req.body.vehiculeId)
      if (!vehicle) throw notFound("Véhicule introuvable")
      if (vehicle.statut === "SORTIE_DEFINITIVE") throw conflict("Ce véhicule est déjà sorti définitivement")
      if (!(await repos.clients.get(req.body.acheteurId))) throw notFound("Acheteur introuvable")
      if (req.body.commercialId && !(await repos.commerciaux.get(req.body.commercialId))) throw notFound("Commercial introuvable")
      const sales = await repos.ventesVehicules.list()
      if (sales.some((sale) => sale.numeroVente === req.body.numeroVente)) throw conflict("Ce numéro de vente existe déjà")
      res.status(201).json(await repos.ventesVehicules.create(req.body, req.user!.id))
    }),
  )

  router.post(
    "/:id/statut",
    [...guard, validateBody(statutSchema)],
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id)
      const vehicle = await repos.vehicules.get(id)
      if (!vehicle) throw notFound("Véhicule introuvable")
      if (vehicle.statut === "SORTIE_DEFINITIVE") throw conflict("Un véhicule sorti définitivement ne peut plus changer de statut")
      if (req.body.statut === "ENVOI_GARAGE" && req.body.garageId !== undefined && !(await repos.garages.get(req.body.garageId))) {
        throw notFound("Garage introuvable")
      }
      if (req.body.statut === "MISE_EN_LOCATION") {
        if (!(await repos.clients.get(req.body.clientId))) throw notFound("Client introuvable")
        if (!(await repos.commerciaux.get(req.body.commercialId))) throw notFound("Commercial introuvable")
      }
      const movement = await repos.mouvements.changeVehicleStatus({
        vehiculeId: id,
        statut: req.body.statut,
        kilometrage: vehicle.kilometrage,
        observation: req.body.observation ?? `Statut changé vers ${req.body.statut}`,
        garageId: req.body.garageId,
        typePassage: req.body.typePassage,
        motif: req.body.motif,
        typeLocation: req.body.typeLocation,
        clientId: req.body.clientId,
        commercialId: req.body.commercialId,
        dateDebut: req.body.dateDebut,
        dateFin: req.body.dateFin,
      })
      const updated = await repos.vehicules.get(id)
      res.json({ vehicle: updated, movement })
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
      if (vehicule.statut === "ENVOI_GARAGE") {
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
      if (!(await repos.modeles.list()).some((m) => m.marque === req.body.marque && m.nom === req.body.modele)) {
        throw notFound("Modèle introuvable : ajoutez d’abord ce modèle au référentiel")
      }
      if (req.body.categorieId !== undefined && req.body.categorieId !== null && !(await repos.categories.get(req.body.categorieId))) {
        throw notFound("Catégorie introuvable")
      }
      const created = await repos.vehicules.create(req.body, req.user!.id)
      await repos.mouvements.createEntry({
        vehiculeId: created.id,
        date: req.body.dateEntreeParc ?? new Date().toISOString().slice(0, 10),
        kilometrage: req.body.kilometrage,
        observation: req.body.observation ?? null,
      })
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
      const current = await repos.vehicules.get(id)
      if (!current) throw notFound("Véhicule introuvable")
      if (current.statut === "SORTIE_DEFINITIVE") throw conflict("Un véhicule sorti définitivement ne peut plus être modifié")
      const marque = req.body.marque ?? current.marque
      const modele = req.body.modele ?? current.modele
      if (marque && modele && !(await repos.modeles.list()).some((m) => m.marque === marque && m.nom === modele)) {
        throw notFound("Modèle introuvable")
      }
      if (req.body.categorieId !== undefined && !(await repos.categories.get(req.body.categorieId))) {
        throw notFound("Catégorie introuvable")
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
      if (!STATUTS_SUPPRIMABLES.has(vehicule.statut)) {
        throw conflict(
          "Suppression autorisée uniquement pour les véhicules en entrée au parc, de retour de location, de retour interne, de retour du garage ou sortis définitivement",
        )
      }
      let removed: boolean
      try {
        removed = await repos.vehicules.remove(id)
      } catch (error) {
        if (isForeignKeyConstraintError(error)) {
          throw conflict("Ce véhicule est encore référencé dans l'historique et ne peut pas être supprimé")
        }
        throw error
      }
      if (!removed) throw notFound("Véhicule introuvable")
      res.status(204).end()
    }),
  )

  return router
}

export { STATUTS }
