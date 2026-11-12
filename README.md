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
- **Auth :** JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`), rôles `responsable` / `admin` / `superadmin`
- **Validation :** `zod` · **PDF :** `pdfkit` (fiches clients, rapports d'activité)

## Prérequis

- Node.js 22
- npm (fourni avec Node)
- MySQL 8 **optionnel pour l'instant** (via `server/docker-compose.yml`) :
  le backend démarre sans MySQL en mode mémoire (`DB_DRIVER=memory`, données démo).

## Démarrage

### Démarrage automatique sous Windows / Laragon

Pour démarrer l'application à chaque ouverture de votre session Windows, ouvrez
PowerShell une seule fois dans le dossier du projet et exécutez :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

Cette installation enregistre une tâche Windows et démarre les services tout de
suite. À chaque ouverture de session par la suite, Laragon démarre MySQL, puis le
frontend sur `http://localhost:8443` et l'API sur le port `3101`. Vous n'aurez
plus à lancer les commandes npm. Les journaux de démarrage sont conservés dans
`logs/`. Si MySQL n'est pas encore prêt ou si un service ne démarre pas, Windows
réessaie automatiquement toutes les minutes (jusqu'à 60 fois). Il faut ouvrir
une session Windows pour que la tâche s'exécute.

Pour supprimer le démarrage automatique, exécutez dans PowerShell :

```powershell
Unregister-ScheduledTask -TaskName "Hertz Car Manager Local" -Confirm:$false
```

### Démarrage manuel

```bash
npm install
npm run dev          # frontend Vite sur http://localhost:8443
npm run server:dev   # backend Express sur http://localhost:3101 (2e terminal)
npm run build        # build production frontend dans dist/
npm run preview      # prévisualiser le build
npm run format       # formater le code (oxfmt)
```

Le frontend appelle le backend via `VITE_API_URL` (défaut `http://localhost:3101`,
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
| `/dashboard/administrateurs` | super admin | Consultation et création des comptes administrateurs |
| `*`                        | public  | Page 404                                  |

## Authentification

Authentification **JWT via le backend** (`POST /api/auth/login`) : `AuthContext` stocke le token
(`hertz-auth-token`) et le profil (`hertz-auth-user`), `ProtectedRoute` redirige vers `/connexion`
si non connecté. L'avatar du header ouvre l'édition du prénom, du nom et de l'adresse e-mail ;
le mot de passe actuel est vérifié avant changement et le nouveau mot de passe est haché côté serveur.
Le super administrateur a accès à tous les modules et peut consulter ou créer des comptes
administrateurs depuis `/dashboard/administrateurs`.
Compte initial de démonstration sur une base neuve : `responsable@hertz.bj` / `hertz2025`.

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

- Le backend peut se connecter au MySQL local de Laragon : démarrez MySQL dans Laragon,
  configurez `server/.env` (`DB_DRIVER=mysql`, hôte, port et identifiants), puis lancez le serveur.
  Initialisez `hertz_benin` avec `npm run db:migrate` depuis `server/` uniquement si elle est vide.
- Écritures limitées au CRUD véhicules (référence) : clients/locations/réservations/maintenances
  en lecture seule — lots Abel & Prince.
- Pastille flotte détaillée (En location / Entretien / Indisponibles) encore statique côté
  Vue d'ensemble — endpoint `GET /api/stats/fleet` à ajouter.
- Images hero/login chargées depuis Unsplash (prévoir un fallback hors-ligne si besoin).
