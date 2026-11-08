import { useOutletContext } from "react-router-dom"

import GenericTablePage from "./GenericTablePage"

import OverviewPage from "./OverviewPage"

import StatisticsPage from "./StatisticsPage"

import type { DashboardOutletContext } from "../DashboardLayout"

import ReferenceCrudPage from "./ReferenceCrudPage"

import MovementsPage from "./MovementsPage"

import VehiclePage from "./VehiclePage"

import GaragesPage from "./GaragesPage"

import GaragePassagesPage from "./GaragePassagesPage"

import RepairsPage from "./RepairsPage"

import LocationsPage from "./LocationsPage"

import ProlongationsPage from "./ProlongationsPage"

import VehicleSalesPage from "./VehicleSalesPage"

import CentersPage from "./CentersPage"

import AgenciesPage from "./AgenciesPage"

import ContraventionsPage from "./ContraventionsPage"

import ConducteursPage from "./ConducteursPage"

export function OverviewRoute() {
  const { onSeeLocations } = useOutletContext<DashboardOutletContext>()

  return <OverviewPage onSeeLocations={onSeeLocations} />
}

function makeTableRoute(
  module: "Commerciaux" | "Véhicules" | "Locations" | "Réservations" | "Clients",
) {
  return function TableRoute() {
    const { query, refreshKey, onAdd } =
      useOutletContext<DashboardOutletContext>()

    return (
      <GenericTablePage
        module={module}
        query={query}
        refreshKey={refreshKey}
        onAdd={onAdd}
      />
    )
  }
}

export const CommerciauxRoute = makeTableRoute("Commerciaux")

export function VehiculesRoute() {
  return <VehiclePage />
}

export function LocationsRoute() {
  return <LocationsPage />
}

export function ProlongationsRoute() {
  return <ProlongationsPage />
}

export const ReservationsRoute = makeTableRoute("Réservations")

export const ClientsRoute = makeTableRoute("Clients")

export function ContraventionsRoute() {
  return <ContraventionsPage />
}

export function ConducteursRoute() {
  return <ConducteursPage />
}

export function CategoriesVehiculesRoute() {
  return <ReferenceCrudPage kind="categories" />
}

export function ModelesVehiculesRoute() {
  return <ReferenceCrudPage kind="modeles" />
}

export function AgencesRoute() {
  return <AgenciesPage />
}

export function CentresRoute() {
  return <CentersPage />
}

export function GaragesRoute() {
  return <GaragesPage />
}

export function GaragePassagesRoute() {
  return <GaragePassagesPage />
}

export function ReparationsRoute() {
  return <RepairsPage />
}

export function MouvementsVehiculesRoute() {
  return <MovementsPage />
}

export function VentesVehiculesRoute() {
  return <VehicleSalesPage />
}

export function StatistiquesRoute() {
  return <StatisticsPage />
}
