# Hertz Car Manager

Solution interne de gestion des activités de location **Hertz Bénin** : véhicules, locations,
réservations, clients, commerciaux et statistiques — pilotés depuis un espace de gestion unique.

Application React + backend Express (lot Darryl), avec navigation par routes, espace protégé par
authentification JWT et données servies par API (driver mémoire ou MySQL).

## Stack

### Frontend

- **Runtime :** React 19 + React DOM 19
- **Routing :** React Router 7 (`createBrowserRouter`)
- **Build :** Vite 8 + `@vitejs/plugin-react`
- **Langage :** TypeScript 5.7 (mode strict)
- **Style :** Tailwind CSS v4 (+ CSS historique conservé — approche hybride, voir ci-dessous)
- **Formatage :** oxfmt
- **Package manager :** npm (`package-lock.json`), Node 22

### Backend (`server/`, lot Darryl)

- **Runtime :** Express 4 + TypeScript strict (dev via `tsx`, build `tsc`)
- **Base :** MySQL 8 (`mysql2`) **ou** mémoire seedée (`DB_DRIVER`, voir ci-dessous)
- **Auth :** JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`), rôles `responsable` / `admin`
- **Validation :** `zod` · **PDF :** `pdfkit` (fiches clients, rapports d'activité)

## Prérequis

- Node.js 22
- npm (fourni avec Node)
- MySQL 8 **optionnel pour l'instant** (via `server/docker-compose.yml`) :
  le backend démarre sans MySQL en mode mémoire (`DB_DRIVER=memory`, données démo).

## Démarrage

```bash
npm install
npm run dev          # frontend Vite sur http://localhost:8443
npm run server:dev   # backend Express sur http://localhost:3001 (2e terminal)
npm run build        # build production frontend dans dist/
npm run preview      # prévisualiser le build
npm run format       # formater le code (oxfmt)
```

Le frontend appelle le backend via `VITE_API_URL` (défaut `http://localhost:3001`,
voir `.env.example`). Sans backend démarré, les pages affichent « Serveur injoignable ».

> Si un serveur de dev tournait avec l'ancienne config, redémarrez-le pour prendre en compte le
> `vite.config.ts` actuel.

## Structure du projet

```text
src/
  app/
    router.tsx      # routes : /, /connexion, /dashboard/* (protégé), * (404)
    routes.ts       # constantes de chemins
  features/
    marketing/
      HomePage.tsx            # page d'accueil publique
    auth/
      AuthContext.tsx        # session JWT (login/logout, token persisté)
      ProtectedRoute.tsx     # garde des routes /dashboard
      LoginPage.tsx          # page de connexion
    dashboard/
      DashboardLayout.tsx     # sidebar + header recherche + <Outlet/>
      components/AddModal.tsx
      pages/                  # OverviewPage, GenericTablePage, StatisticsPage, ModuleRoutes
  shared/
    api/            # client HTTP (JWT Bearer, erreurs normalisées, URLs d'export)
    components/     # Icon, Logo, StatusBadge, WidgetTitle
    data/           # types.ts, mockData.ts (photos + icônes), dashboardService.ts (HTTP)
    pages/          # NotFoundPage (404)
  main.tsx          # entrypoint : AuthProvider + RouterProvider
  index.css         # CSS historique + import Tailwind
server/             # backend Express (voir server/README.md : API, contrat Abel/Prince)
```

## Routes

| Chemin                     | Accès   | Contenu                                   |
| -------------------------- | ------- | ----------------------------------------- |
| `/`                        | public  | Accueil, présentation de la plateforme    |
| `/connexion`               | public  | Connexion responsable (redirige si connecté) |
| `/dashboard`               | protégé | Vue d'ensemble (stats, CA, flotte, activité) |
| `/dashboard/commerciaux`   | protégé | Gestion des commerciaux                   |
| `/dashboard/vehicules`     | protégé | Gestion de la flotte                      |
| `/dashboard/locations`     | protégé | Contrats courte / longue durée            |
| `/dashboard/reservations`  | protégé | Réservations (abouties / en attente / non abouties) |
| `/dashboard/clients`       | protégé | Fiches clients + impression                |
| `/dashboard/statistiques`  | protégé | CA mensuel, utilisation, rotation         |
| `*`                        | public  | Page 404                                  |

## Authentification

Authentification **JWT via le backend** (`POST /api/auth/login`) : `AuthContext` stocke le token
(`hertz-auth-token`) et le profil (`hertz-auth-user`), `ProtectedRoute` redirige vers `/connexion`
si non connecté. Compte démo seedé : `responsable@hertz.bj` / `hertz2025`.

## Données

Données servies par **hertz-server** (`src/shared/data/dashboardService.ts` mappe le JSON en
lignes de tableaux) :

- `shared/api/client.ts` — `apiFetch()` (Bearer auto), `ApiError`, `exportUrl()` (PDF)
- `shared/data/types.ts` — `DashboardModule`, `TableModule`, `TableData`, `AuthUser`
- `shared/data/dashboardService.ts` — `fetchTable()`, `filterTable()`, `fetchOverviewStats()`,
  `fetchRecentLocations()`, `fetchMonthly()`

La recherche du header filtre les lignes du module courant (insensible à la casse).
Détail des endpoints : voir `server/README.md`.

## Styling

Approche **hybride prudente** : le CSS historique de `src/index.css` est conservé tel quel (mise en
page, responsive 1000px/700px), Tailwind est réservé au nouveau code (ex. page 404). Ne pas
mélanger les deux sur un même composant existant sans test visuel.

## Déploiement

```bash
npm run build   # produit dist/ (index.html + assets)
```

Servir `dist/` avec n'importe quel hébergeur statique **avec fallback SPA** (toute route inconnue
→ `index.html`), requis par React Router.

## Statut et limites connues

- MySQL non encore branché : le backend tourne en mémoire seedée (`DB_DRIVER=memory`) ;
  `docker compose up -d` + `npm run server:migrate` dans `server/` pour basculer.
- Écritures limitées au CRUD véhicules (référence) : clients/locations/réservations/maintenances
  en lecture seule — lots Abel & Prince.
- Pastille flotte détaillée (En location / Entretien / Indisponibles) encore statique côté
  Vue d'ensemble — endpoint `GET /api/stats/fleet` à ajouter.
- Images hero/login chargées depuis Unsplash (prévoir un fallback hors-ligne si besoin).
