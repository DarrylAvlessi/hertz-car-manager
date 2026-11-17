import type { VehiculeStatut } from "../../repositories/types.js"

export const STATUTS_AUTORISANT_NOUVELLE_OPERATION: ReadonlySet<VehiculeStatut> =
  new Set(["ENTREE_PARC", "RETOUR_LOCATION", "RETOUR_GARAGE", "RETOUR_INTERNE"])

export const STATUTS_NOUVELLES_OPERATIONS: ReadonlySet<VehiculeStatut> = new Set([
  "MISE_EN_LOCATION",
  "ENVOI_GARAGE",
  "SORTIE_INTERNE",
  "RESERVATION",
  "SORTIE_DEFINITIVE",
])

export function canStartVehicleOperation(status: VehiculeStatut): boolean {
  return STATUTS_AUTORISANT_NOUVELLE_OPERATION.has(status)
}
