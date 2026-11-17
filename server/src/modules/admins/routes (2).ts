import { Router } from "express"
import { z } from "zod"
import { conflict } from "../../lib/httpErrors.js"
import { hashPassword } from "../../lib/password.js"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"

const createAdminSchema = z.object({
  nom: z.string().trim().min(1, "Nom requis").max(80),
  prenom: z.string().trim().min(1, "Prénom requis").max(80),
  email: z.string().trim().email("Adresse e-mail invalide").max(120),
  password: z
    .string()
    .min(12, "Le mot de passe doit contenir au moins 12 caractères")
    .max(72)
    .refine(
      (password) => Buffer.byteLength(password, "utf8") <= 72,
      "Le mot de passe ne peut pas dépasser 72 octets",
    ),
  role: z.enum(["responsable", "admin", "superadmin"]),
})

export function adminsRouter(repos: Repositories, env: Env): Router {
  const router = Router()
  router.use(requireAuth(env.JWT_SECRET), requireRole("superadmin"))

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ admins: await repos.admins.list() })
    }),
  )

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = createAdminSchema.parse(req.body)
      const email = input.email.toLowerCase()

      if (await repos.admins.findByEmail(email)) {
        throw conflict("Cette adresse e-mail est déjà utilisée")
      }

      try {
        const admin = await repos.admins.create({
          nom: input.nom,
          prenom: input.prenom,
          email,
          role: input.role,
          passwordHash: await hashPassword(input.password),
        })
        res.status(201).json({ admin })
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ER_DUP_ENTRY"
        ) {
          throw conflict(
            "Cette adresse ou cet identifiant de connexion est déjà utilisé",
          )
        }
        throw error
      }
    }),
  )

  return router
}
