import { useMemo, useState } from "react"

export function useQueryFilter() {
  const [query, setQuery] = useState("")
  const normalized = useMemo(() => query.trim().toLowerCase(), [query])
  return { query, setQuery, normalized }
}

export function matchesQuery(row: string[], normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  return row.join(" ").toLowerCase().includes(normalizedQuery)
}
