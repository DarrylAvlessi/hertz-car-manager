import type { NextFunction, Request, Response } from "express"
import { z } from "zod"
import type { ZodSchema } from "zod"
import { verifyToken } from "../lib/jwt.js"
import { forbidden, unauthorized } from "../lib/httpErrors.js"
import type { Role } from "../repositories/types.js"

export function requireAuth(secret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Token via header Authorization (API) ou query ?token= (exports PDF ouverts en nouvel onglet)
    const header = req.headers.authorization
    const fromHeader = header?.startsWith("Bearer ") ? header.slice(7) : undefined
    const fromQuery = typeof req.query.token === "string" ? req.query.token : undefined
    const token = fromHeader ?? fromQuery
    if (!token) {
      next(unauthorized())
      return
    }
    try {
      req.user = verifyToken(token, secret)
      next()
    } catch {
      next(unauthorized("Session invalide ou expirée"))
    }
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(forbidden())
      return
    }
    next()
  }
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body) as unknown
    next()
  }
}

export const paginationSchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
