import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../middleware/asyncHandler.js"
import { unauthorized } from "../../lib/httpErrors.js"
import { signToken } from "../../lib/jwt.js"
import { verifyPassword } from "../../lib/password.js"
import { requireAuth } from "../../middleware/auth.js"
import type { Env } from "../../config/env.js"
import type { Repositories } from "../../repositories/types.js"

const loginSchema = z.object({
  email: z.string().email("Adresse e-mail invalide"),
  password: z.string().min(1, "Mot de passe requis"),
})

export function authRouter(repos: Repositories, env: Env): Router {
  const router = Router()

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const { email, password } = loginSchema.parse(req.body)
      const record = await repos.admins.findByEmail(email)
      if (!record || !(await verifyPassword(password, record.passwordHash))) {
        throw unauthorized("Identifiants invalides")
      }
      const user = { id: record.id, nom: record.nom, email: record.email, role: record.role }
      res.json({ token: signToken({ id: user.id, email: user.email, role: user.role }, env), user })
    }),
  )

  router.get(
    "/me",
    requireAuth(env.JWT_SECRET),
    asyncHandler(async (req, res) => {
      const user = await repos.admins.findById(req.user!.id)
      if (!user) throw unauthorized("Session invalide ou expirée")
      res.json({ user })
    }),
  )

  return router
}
