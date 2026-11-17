export class HttpError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details)
}

export function unauthorized(message = "Authentification requise"): HttpError {
  return new HttpError(401, message)
}

export function forbidden(message = "Accès interdit"): HttpError {
  return new HttpError(403, message)
}

export function notFound(message = "Ressource introuvable"): HttpError {
  return new HttpError(404, message)
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message)
}
