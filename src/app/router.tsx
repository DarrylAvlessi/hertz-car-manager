import { createBrowserRouter } from "react-router-dom"
import HomePage from "@/features/marketing/HomePage"
import LoginPage from "@/features/auth/LoginPage"
import ProtectedRoute from "@/features/auth/ProtectedRoute"
import DashboardLayout from "@/features/dashboard/DashboardLayout"
import {
  ClientsRoute,
  CommerciauxRoute,
  LocationsRoute,
  ProlongationsRoute,
  OverviewRoute,
  ReservationsRoute,
  StatistiquesRoute,
  VehiculesRoute,
  CategoriesVehiculesRoute,
  ModelesVehiculesRoute,
  MouvementsVehiculesRoute,
  GaragesRoute,
  GaragePassagesRoute,
  ReparationsRoute,
  VentesVehiculesRoute,
} from "@/features/dashboard/pages/ModuleRoutes"
import NotFoundPage from "@/shared/pages/NotFoundPage"

export const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/connexion", element: <LoginPage /> },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <OverviewRoute /> },
      { path: "commerciaux", element: <CommerciauxRoute /> },
      { path: "vehicules", element: <VehiculesRoute /> },
      { path: "parc/categories", element: <CategoriesVehiculesRoute /> },
      { path: "parc/modeles", element: <ModelesVehiculesRoute /> },
      { path: "parc/garages", element: <GaragesRoute /> },
      { path: "parc/passages-garage", element: <GaragePassagesRoute /> },
      { path: "parc/reparations", element: <ReparationsRoute /> },
      { path: "parc/mouvements", element: <MouvementsVehiculesRoute /> },
      { path: "parc/ventes", element: <VentesVehiculesRoute /> },
      { path: "locations", element: <LocationsRoute /> },
      { path: "locations/prolongations", element: <ProlongationsRoute /> },
      { path: "reservations", element: <ReservationsRoute /> },
      { path: "clients", element: <ClientsRoute /> },
      { path: "statistiques", element: <StatistiquesRoute /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
