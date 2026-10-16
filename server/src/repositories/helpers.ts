import type { Performance } from "./types.js"

// Seuils alignés sur le prototype : 38 Excellent, 31 Très bien, 25 Bien, 17 À suivre.
export function performanceOf(locationsConclues: number): Performance {
  if (locationsConclues >= 35) return "Excellent"
  if (locationsConclues >= 28) return "Très bien"
  if (locationsConclues >= 20) return "Bien"
  return "À suivre"
}

// Chevauchement de périodes [debutA, finA] x [debutB, finB] (dates ISO YYYY-MM-DD).
export function overlaps(debutA: string, finA: string, debutB: string, finB: string): boolean {
  return debutA <= finB && debutB <= finA
}

export function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function matchesQuery(haystack: string, q?: string): boolean {
  if (!q) return true
  return haystack.toLowerCase().includes(q.trim().toLowerCase())
}
