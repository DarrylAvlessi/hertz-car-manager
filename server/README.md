# hertz-server — Backend Hertz Bénin (lot Darryl)

Express + TypeScript strict, stockage interchangeable **memory | MySQL** via `DB_DRIVER`.

## Démarrage rapide (sans MySQL)

```bash
cp .env.example .env   # renseigner JWT_SECRET (déjà fait en local)
npm install
npm run dev            # http://localhost:3101, driver=memory seedé
```

## Utiliser la base Hertz existante

Pour utiliser la base XAMPP existante `gestion_location_hertz`, configurez
`server/.env` avec `DB_DRIVER=mysql`, `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME=gestion_location_hertz` et `JWT_SECRET`, puis lancez
`npm run dev --prefix server`.

## Session d'authentification

Les sessions sont des JWT valables 12 heures par défaut. La durée peut être
configurée avec `JWT_EXPIRES_IN` (`1h`, `8h`, `12h`, `24h` ou `7d`). À chaque
chargement de l'application, le frontend vérifie le token avec `/api/auth/me`.
Un token expiré ou invalide est supprimé du navigateur et l'utilisateur est
redirigé vers `/connexion`. Les réponses HTTP `401` déclenchent le même
nettoyage pendant l'utilisation de l'application.

La base existante contient déjà ses données : ne lancez ni `db:migrate` ni
`db:import-parc` dessus. `db:migrate` refuse désormais toute base qui contient
déjà des tables, vues, procédures, triggers ou événements. Le dépôt MySQL prend
en charge les listes, les fiches, les statistiques, la disponibilité et les
écritures de clients, commerciaux, véhicules, réservations et locations.

Pour une base déjà initialisée, appliquez séparément les migrations compatibles
avec ses données. En particulier, la migration
`src/db/migrations/001_allow_non_overlapping_rentals.sql` corrige le contrôle
des locations successives sans chevauchement. Elle ne modifie aucune ligne de
données. Depuis PowerShell, placez-vous dans `server/`, puis lancez le client
via `cmd.exe` afin que la redirection `<` soit interprétée par l'invite Windows
(et non par PowerShell) :

```powershell
cmd.exe /c "mysql -h 127.0.0.1 -u hertz -p gestion_location_hertz < src\db\migrations\001_allow_non_overlapping_rentals.sql"
```

Pour une base existante, appliquez les colonnes de suivi facturation/paiement
des locations depuis la racine du dépôt :

```bash
npm run migrate:location-csv
```

Cette commande lit `server/.env`, vérifie que la table `location` existe et
ajoute uniquement les colonnes manquantes. Elle peut être relancée sans risque.
Elle est distincte de `npm run server:migrate`, qui initialise uniquement une
base vide.

Pour mettre à jour le cycle de vie des réservations d'une base existante,
lancez depuis la racine :

```bash
npm run migrate:reservation-status
```

Cette migration convertit les anciens statuts, ajuste les vues et triggers, et
peut être relancée. Le serveur passe les réservations « À venir » à « Annulée »
à 23 h 59 le jour du départ si elles ne sont pas démarrées, puis termine les
réservations « En cours » à 23 h 59 le jour de fin prévu.

Pour créer immédiatement une affaire perdue à chaque annulation de réservation
(y compris les annulations automatiques) et préparer l'export CSV, lancez
ensuite depuis la racine :

```bash
npm run migrate:reservation-lost-affairs
```

Cette migration enregistre également les réservations déjà annulées, permet les
références client/commercial absentes, et garantit une seule affaire perdue par
réservation annulée. Elle peut être relancée sans créer de doublons.

Pour activer le module Contraventions sur une base Hertz existante, lancez
depuis la racine :

```bash
npm run migrate:contraventions
```

Cette migration ajoute les colonnes permettant de conserver les noms de client
et d'agent de vente du CSV lorsque leurs fiches ne peuvent pas être rapprochées.
Le module fournit le CRUD, l'import du format ANATT et l'export avec les
synthèses d'en-tête.

Pour conserver l'heure exacte des envois et retours au garage sur une base
existante, lancez également depuis la racine :

```bash
npm run migrate:garage-timestamps
```

Pour enregistrer les commerciaux, motifs et dates des sorties internes sur une
base existante, lancez ensuite :

```bash
npm run migrate:internal-exits
```

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
| `npm run db:migrate` | initialise (base vide) `schema.sql` + `seed.sql` et ajoute les références manquantes vers les véhicules ; échoue si des historiques orphelins empêchent leur rétablissement (MySQL requis) |
| `npm run db:migrate-reservation-lifecycle` | convertit les statuts de réservation existants et met à jour les triggers/vues pour le nouveau cycle de vie |
| `npm run db:migrate-reservation-lost-affairs` | crée une affaire perdue lors d'une annulation et prépare son export CSV |
| `npm run db:migrate-contraventions` | ajoute les colonnes d'import requises par le module Contraventions |
| `npm run db:import-parc` | importe le jeu agents/parc une seule fois, avec contrôles et transaction |

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
| DELETE  | `/vehicules/:id`                       | resp | 204 uniquement pour `ENTREE_PARC`, `RETOUR_LOCATION`, `RETOUR_INTERNE`, `RETOUR_GARAGE` ou `SORTIE_DEFINITIVE`, si aucune autre table ne le référence; sinon 409. |
| GET     | `/clients`, `/clients/:id`, `/clients/:id/fiche` | resp | + fiche enrichie (nb locations, dernière opération) |
| POST/PUT/DELETE | `/clients`, `/clients/:id`           | resp | création, modification, suppression protégée si historique |
| GET     | `/commerciaux`, `/commerciaux/:id`     | resp | fiches avec CA + performance calculés    |
| POST    | `/commerciaux/import-csv`                | resp | import validé par abréviation et code agence; téléphone et email facultatifs |
| POST/PUT/DELETE | `/commerciaux`, `/commerciaux/:id`  | resp | création, modification, désactivation    |
| GET     | `/locations?q&limit`, `/locations/:id` | resp | fiches avec noms client/véhicule         |
| POST    | `/locations`                           | resp | création LCD/LLD avec contrôle de disponibilité |
| POST    | `/locations/import-csv`                | resp | import depuis le modèle Excel; résout client, véhicule et commercial existants, contrôle dates et disponibilité, conserve aussi les colonnes de suivi facturation/paiement |
| GET     | `/reservations`, `/reservations/:id`   | resp | fiches avec noms client/commercial       |
| GET/POST | `/contraventions`                    | resp | liste et création des contraventions      |
| PUT/DELETE | `/contraventions/:id`               | resp | modification et suppression               |
| POST    | `/contraventions/import-csv`           | resp | import ANATT en transaction               |
| GET     | `/reservations/affaires-perdues`       | resp | affaires perdues liées aux réservations annulées, pour export CSV |
| POST    | `/reservations`                        | resp | création avec client, commercial et véhicule associés |
| PUT/DELETE | `/reservations/:id`                  | resp | modification complète; suppression refusée si une location est liée |
| GET     | `/reservations/:id/history`             | resp | journal des changements de statut         |
| POST    | `/reservations/import-csv`              | resp | import depuis le modèle RESA (les clients/agents ou dates historiques absents sont conservés) |
| PUT     | `/reservations/:id/status`             | resp | démarrage, annulation ou clôture d'une réservation |
| GET     | `/maintenances`, `/maintenances/:id`   | resp | passages garage                          |
| GET     | `/mouvements?vehiculeId`               | resp | flux chronologiques                      |
| GET     | `/stats/overview`, `/stats/monthly`, `/stats/daily`, `/stats/fleet-status` | resp | KPIs + série mensuelle + quotidiens + état de la flotte |
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
