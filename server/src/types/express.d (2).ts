import type { AuthToken } from "../lib/jwt.js"

declare global {
  namespace Express {
    interface Request {
      user?: AuthToken
    }
  }
}

export {}
