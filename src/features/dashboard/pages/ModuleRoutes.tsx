import { useOutletContext } from "react-router-dom"
import GenericTablePage from "./GenericTablePage"
import OverviewPage from "./OverviewPage"
import StatisticsPage from "./StatisticsPage"
import type { DashboardOutletContext } from "../DashboardLayout"

export function OverviewRoute() {
  const { onSeeLocations } = useOutletContext<DashboardOutletContext>()
  return <OverviewPage onSeeLocations={onSeeLocations} />
}

function makeTableRoute(
  module: "Commerciaux" | "Véhicules" | "Locations" | "Réservations" | "Clients",
) {
  return function TableRoute() {
    const { query, refreshKey, onAdd } = useOutletContext<DashboardOutletContext>()
    return <GenericTablePage module={module} query={query} refreshKey={refreshKey} onAdd={onAdd} />
  }
}

export const CommerciauxRoute = makeTableRoute("Commerciaux")
export const VehiculesRoute = makeTableRoute("Véhicules")
export const LocationsRoute = makeTableRoute("Locations")
export const ReservationsRoute = makeTableRoute("Réservations")
export const ClientsRoute = makeTableRoute("Clients")

export function StatistiquesRoute() {
  return <StatisticsPage />
}
