import jwt from "jsonwebtoken"
import type { Env } from "../config/env.js"
import type { Role } from "../repositories/types.js"

export interface AuthToken {
  id: number
  email: string
  role: Role
}

export function signToken(user: AuthToken, env: Env): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  })
}

export function verifyToken(token: string, secret: string): AuthToken {
  const decoded = jwt.verify(token, secret) as unknown as {
    sub: number
    email: string
    role: Role
  }
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Token invalide")
  }
  return { id: decoded.sub, email: decoded.email, role: decoded.role }
}
