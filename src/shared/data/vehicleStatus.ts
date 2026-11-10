const statusesAllowingNewOperation = new Set([
  "ENTREE_PARC",
  "RETOUR_LOCATION",
  "RETOUR_GARAGE",
  "RETOUR_INTERNE",
])

export function canUseVehicleForNewOperation(status?: string | null): boolean {
  return status !== undefined && status !== null && statusesAllowingNewOperation.has(status)
}
