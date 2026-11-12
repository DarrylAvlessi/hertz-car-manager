import { Router } from "express"

import { z } from "zod"

import { asyncHandler } from "../../middleware/asyncHandler.js"

import { badRequest, conflict, unauthorized } from "../../lib/httpErrors.js"

import { signToken } from "../../lib/jwt.js"

import { hashPassword, verifyPassword } from "../../lib/password.js"

import { requireAuth } from "../../middleware/auth.js"

import type { Env } from "../../config/env.js"

import type { Repositories } from "../../repositories/types.js"

const loginSchema = z.object({
  email: z.string().email("Adresse e-mail invalide"),

  password: z.string().min(1, "Mot de passe requis"),
})

const profileSchema = z

  .object({
    nom: z.string().trim().min(1, "Nom requis").max(80),

    prenom: z.string().trim().min(1, "Prénom requis").max(80),

    email: z.string().trim().email("Adresse e-mail invalide").max(120),

    currentPassword: z.string().min(1).optional(),

    newPassword: z

      .string()

      .min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères")

      .max(72)

      .refine(
        (password) => Buffer.byteLength(password, "utf8") <= 72,

        "Le nouveau mot de passe ne peut pas dépasser 72 octets",
      )

      .optional(),
  })

  .refine((profile) => !profile.newPassword || profile.currentPassword, {
    path: ["currentPassword"],

    message: "Saisissez votre mot de passe actuel pour le modifier",
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

      const user = {
        id: record.id,

        nom: record.nom,

        prenom: record.prenom,

        email: record.email,

        role: record.role,
      }

      res.json({
        token: signToken(
          { id: user.id, email: user.email, role: user.role },
          env,
        ),
        user,
      })
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

  router.put(
    "/me",

    requireAuth(env.JWT_SECRET),

    asyncHandler(async (req, res) => {
      const input = profileSchema.parse(req.body)

      const current = await repos.admins.findRecordById(req.user!.id)

      if (!current) throw unauthorized("Session invalide ou expirée")

      const currentPassword = input.currentPassword ?? ""

      if (
        input.newPassword &&
        !(await verifyPassword(currentPassword, current.passwordHash))
      ) {
        throw badRequest("Le mot de passe actuel est incorrect")
      }

      const email = input.email.toLowerCase()

      const emailOwner = await repos.admins.findByEmail(email)

      if (emailOwner && emailOwner.id !== current.id) {
        throw conflict("Cette adresse e-mail est déjà utilisée")
      }

      let passwordHash: string | undefined

      if (input.newPassword)
        passwordHash = await hashPassword(input.newPassword)

      let user

      try {
        user = await repos.admins.updateProfile(current.id, {
          nom: input.nom,

          prenom: input.prenom,

          email,

          passwordHash,
        })
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ER_DUP_ENTRY"
        ) {
          throw conflict("Cette adresse e-mail est déjà utilisée")
        }

        throw error
      }

      if (!user) throw unauthorized("Session invalide ou expirée")

      const token = signToken(
        { id: user.id, email: user.email, role: user.role },

        env,
      )

      res.json({ token, user })
    }),
  )

  return router
}
