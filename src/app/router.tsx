import { createBrowserRouter } from "react-router-dom"
import HomePage from "@/features/marketing/HomePage"
import LoginPage from "@/features/auth/LoginPage"
import ProtectedRoute from "@/features/auth/ProtectedRoute"
import DashboardLayout from "@/features/dashboard/DashboardLayout"
import {
  ClientsRoute,
  CommerciauxRoute,
  LocationsRoute,
  OverviewRoute,
  ReservationsRoute,
  StatistiquesRoute,
  VehiculesRoute,
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
      { path: "locations", element: <LocationsRoute /> },
      { path: "reservations", element: <ReservationsRoute /> },
      { path: "clients", element: <ClientsRoute /> },
      { path: "statistiques", element: <StatistiquesRoute /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
