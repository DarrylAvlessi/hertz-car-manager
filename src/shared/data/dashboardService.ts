import { mockTables } from "./mockData"
import type { TableModule } from "./types"

export function getTable(module: TableModule) {
  return mockTables[module]
}

export function filterRows(module: TableModule, query: string): string[][] {
  const q = query.trim().toLowerCase()
  const rows = mockTables[module].rows
  if (!q) return rows
  return rows.filter((row) => row.join(" ").toLowerCase().includes(q))
}

export function getRecentLocations(count = 3): string[][] {
  return mockTables["Locations"].rows.slice(0, count)
}
