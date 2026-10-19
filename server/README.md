# hertz-server — Backend Hertz Bénin (lot Darryl)

Express + TypeScript strict, stockage interchangeable **memory | MySQL** via `DB_DRIVER`.

## Démarrage rapide (sans MySQL)

```bash
cp .env.example .env   # renseigner JWT_SECRET (déjà fait en local)
npm install
npm run dev            # http://localhost:3101, driver=memory seedé
```

## Brancher MySQL (plus tard)

```bash
docker compose up -d
# renseigner server/.env : DB_DRIVER=mysql (+ identifiants si différents)
npm run db:migrate      # schéma + seed idempotent
npm run dev
```

## Scripts

| Commande          | Effet                                              |
| ----------------- | -------------------------------------------------- |
| `npm run dev`     | dev avec reload (tsx watch)                        |
| `npm run build`   | compile vers `dist/` (tsc strict)                  |
| `npm run start`   | lance `dist/index.js` (prod)                       |
| `npm run typecheck` | vérification TypeScript sans émission            |
| `npm run db:migrate` | exécute `schema.sql` + `seed.sql` (MySQL requis) |

## API (base `/api`, JWT Bearer sauf `/health`)

| Méthode | Route                                  | Rôle | Description                              |
| ------- | -------------------------------------- | ---- | ---------------------------------------- |
| GET     | `/health`                              | —    | statut + driver actif                    |
| POST    | `/auth/login` `{email,password}`       | —    | → `{token, user}`                        |
| GET     | `/auth/me`                             | auth | profil du token                          |
| GET/POST | `/parc/categories`                    | resp | liste et création des catégories véhicule |
| PUT/DELETE | `/parc/categories/:id`              | resp | modification et suppression d’une catégorie |
| GET/POST | `/parc/modeles`                       | resp | liste et création des modèles véhicule |
| PUT/DELETE | `/parc/modeles/:id`                 | resp | modification et suppression d’un modèle |
| GET     | `/vehicules?q&limit`                   | resp | liste véhicules                          |
| GET     | `/vehicules/:id`                       | resp | détail                                   |
| GET     | `/vehicules/:id/disponibilite?from&to` | resp | règle garage/location/résa (tunnel Prince) |
| POST    | `/vehicules`                           | resp | création (201, 409 si doublon)           |
| PUT     | `/vehicules/:id`                       | resp | modification                             |
| DELETE  | `/vehicules/:id`                       | resp | 204, 409 si lié à location/résa         |
| GET     | `/clients`, `/clients/:id`, `/clients/:id/fiche` | resp | + fiche enrichie (nb locations, dernière opération) |
| GET     | `/commerciaux`, `/commerciaux/:id`     | resp | fiches avec CA + performance calculés    |
| GET     | `/locations?q&limit`, `/locations/:id` | resp | fiches avec noms client/véhicule         |
| GET     | `/reservations`, `/reservations/:id`   | resp | fiches avec noms client/commercial       |
| GET     | `/maintenances`, `/maintenances/:id`   | resp | passages garage                          |
| GET     | `/mouvements?vehiculeId`               | resp | flux chronologiques                      |
| GET     | `/stats/overview`, `/stats/monthly`    | resp | KPIs + série mensuelle                   |
| GET     | `/export/clients/:id/fiche`            | resp | fiche client PDF (token header ou `?token=`) |
| GET     | `/export/rapports/activite?debut&fin`  | resp | rapport d'activité PDF                   |

Conventions d'erreur : `{error, details}` avec 400 (zod), 401, 403, 404, 409, 500.

## Contrat pour les lots Abel & Prince (ajouter un module)

1. Étendre les interfaces dans `src/repositories/types.ts`.
2. Implémenter **les deux drivers** : `memory/` (tableau seedé) et `mysql/` (SQL).
3. Créer `src/modules/<nom>/routes.ts` : validation `zod`, `asyncHandler`,
   `validateBody`, erreurs via `lib/httpErrors.ts` (201/404/409).
4. Enregistrer le routeur dans `src/index.ts` sous `/api/<nom>`.
5. Le CRUD `vehicules` est l'exemple à copier. Les écritures manquantes
   (clients, locations, réservations, maintenances) sont vos lots.

## Comptes démo

- `responsable@hertz.bj` / `hertz2025` (rôle `responsable`, seedé).
