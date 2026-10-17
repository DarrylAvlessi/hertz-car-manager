# hertz-server — Backend Hertz Bénin (lot Darryl)

Express + TypeScript strict, stockage interchangeable **memory | MySQL** via `DB_DRIVER`.

## Démarrage rapide (sans MySQL)

```bash
cp .env.example .env   # renseigner JWT_SECRET (déjà fait en local)
npm install
npm run dev            # http://localhost:3001, driver=memory seedé
```

## Utiliser la base Hertz existante

Pour utiliser la base XAMPP existante `gestion_location_hertz`, configurez
`server/.env` avec `DB_DRIVER=mysql`, `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME=gestion_location_hertz` et `JWT_SECRET`, puis lancez
`npm run dev --prefix server`.

La base existante contient déjà ses données : ne lancez ni `db:migrate` ni
`db:import-parc` dessus. `db:migrate` refuse désormais toute base qui contient
déjà des tables, vues, procédures, triggers ou événements. Le dépôt MySQL est
adapté au schéma détaillé Hertz pour les listes, les fiches, les statistiques,
la disponibilité, ainsi que la création de clients et de véhicules. Les autres
opérations d'écriture ne sont pas encore implémentées.

## Initialiser une nouvelle base vide

Configurez `server/.env` avec `DB_DRIVER=mysql`, les identifiants MySQL et un
`DB_NAME` autorisé, puis exécutez les commandes depuis `server/` :

```bash
npm run db:migrate       # schema.sql puis données de référence seed.sql
npm run db:import-parc   # optionnel : agents, clients et parc initial
```

La migration ne fonctionne que sur une base sans aucun objet ; le seed est
destiné à cette initialisation unique, pas à être rejoué. Le compte
`admin@exemple.local` est créé avec un hash volontairement inutilisable :
remplacez-le par un vrai hash avant toute connexion. L'import du parc vérifie
que ses tables cibles sont vides, utilise une transaction et refuse les
réimportations. N'exécutez pas directement le fichier SQL d'import.

## Scripts

| Commande          | Effet                                              |
| ----------------- | -------------------------------------------------- |
| `npm run dev`     | dev avec reload (tsx watch)                        |
| `npm run build`   | compile vers `dist/` (tsc strict)                  |
| `npm run start`   | lance `dist/index.js` (prod)                       |
| `npm run typecheck` | vérification TypeScript sans émission            |
| `npm run db:migrate` | initialise uniquement une base vide avec le schéma détaillé et les références |
| `npm run db:import-parc` | importe le jeu agents/parc une seule fois, avec contrôles et transaction |

## API (base `/api`, JWT Bearer sauf `/health`)

| Méthode | Route                                  | Rôle | Description                              |
| ------- | -------------------------------------- | ---- | ---------------------------------------- |
| GET     | `/health`                              | —    | statut + driver actif                    |
| POST    | `/auth/login` `{email,password}`       | —    | → `{token, user}`                        |
| GET     | `/auth/me`                             | auth | profil du token                          |
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
