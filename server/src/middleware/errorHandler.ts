import type { NextFunction, Request, Response } from "express"
import { ZodError } from "zod"
import { HttpError } from "../lib/httpErrors.js"

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details ?? null })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Données invalides", details: err.flatten().fieldErrors })
    return
  }
  console.error("Erreur inattendue :", err)
  res.status(500).json({ error: "Erreur interne du serveur" })
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Route introuvable" })
}
