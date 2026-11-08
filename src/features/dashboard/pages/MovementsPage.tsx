import { useEffect, useMemo, useState } from "react"

import { apiFetch } from "@/shared/api/client"

import DetailModal from "@/shared/components/DetailModal"

import Icon from "@/shared/components/Icon"

import { downloadCsv } from "@/shared/data/csv"

import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"

import DatePeriodFilter, {
  matchesDatePeriod,
  type DatePeriod,
} from "../components/DatePeriodFilter"

type MovementType = "ENTREE_PARC" | "MISE_EN_LOCATION" | "RETOUR_LOCATION" | "SORTIE_INTERNE" | "RETOUR_INTERNE" | "ENVOI_GARAGE" | "RETOUR_GARAGE" | "SORTIE_DEFINITIVE" | "RESERVATION"

interface Movement {
  id: number

  vehiculeId: number

  kmDepart: number

  kmRetour: number | null

  kmParcourus: number | null

  locationId?: number | null

  passageId?: number | null

  commercialId?: number | null

  validateurId?: number | null

  type: MovementType

  motif: string | null

  kilometrage: number | null

  dateRetour?: string | null

  date: string

  commentaire: string | null
}

interface VehicleOption {
  id: number

  immatriculation: string

  marque?: string

  modele?: string

  marqueModele?: string
}

interface RentalExportRow {
  id: number

  reference: string

  clientId: number | null

  vehiculeId: number

  commercialId: number | null

  type: string

  dateDebut: string

  dateFin: string

  dateRetourReelle?: string | null

  kmDepart?: number | null

  kmRetour?: number | null

  kmParcourus?: number | null

  statut: string

  observation?: string | null

  paye?: boolean | null

  payeImport?: string | null
}

interface GarageExportRow {
  id: number

  typePassage: string

  dateEntree: string

  dateSortiePrevue: string | null

  dateSortieReelle: string | null

  kmEntree: number | null

  motif: string | null

  statut: string

  coutTotal: number

  vehiculeId: number

  garage: string | null
}

interface SaleExportRow {
  id: number

  numeroVente: string

  vehiculeId: number

  acheteurId: number

  dateVente: string

  prixVente: number

  devise: string

  motifVente: string

  etatVehicule: string

  kilometrageVente: number

  statutPaiement: string

  dateRemiseVehicule: string | null

  referenceCession: string | null

  statut: string

  commercialId: number | null

  observation: string | null
}

interface NamedOption {
  id: number

  nom: string
}

const movementTypes: MovementType[] = [
  "ENTREE_PARC",
  "MISE_EN_LOCATION",
  "RETOUR_LOCATION",
  "SORTIE_INTERNE",

  "RETOUR_INTERNE",
  "ENVOI_GARAGE",
  "RETOUR_GARAGE",
  "SORTIE_DEFINITIVE",
  "RESERVATION",
]

const JOURNAL_COLUMN_COUNT = 37

const journalHeaders = [
  "N°",
  "IMMAT",
  "VEHICULE",
  "DATE DEPART",
  "HEURE DEPART",

  "ADRESSE DE DEPART",
  "UTILISATEUR / CONDUCTEUR",
  "MOTIF",
  "Agent de vente",

  "KM DEPART",
  "RETOUR PREVU",
  "DATE RETOUR",
  "HEURE RETOUR",
  "DUREE (J)",

  "KM RETOUR",
  "Km parcourus",
  "ADRESSE RETOUR",
  "VALIDATEUR",

  "Contraventions commises",
  "Statut du paiement",
  "Payeur",
  "Observation",
]

function paddedJournalRow(
  values: Array<string | number>,
): Array<string | number> {
  return [
    ...values,
    ...Array(Math.max(0, JOURNAL_COLUMN_COUNT - values.length)).fill(""),
  ]
}

function dateTimeParts(
  value: string | null | undefined,
): { date: string; time: string } {
  if (!value) return { date: "", time: "" }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(
    value.trim(),
  )

  if (!match) return { date: "", time: "" }

  return {
    date: `${match[3]}/${match[2]}/${match[1]}`,

    time: match[4] && match[5] ? `${match[4]}:${match[5]}` : "",
  }
}

function daysBetween(
  start: string,
  end: string,
  minimumOne = false,
): number | "" {
  const startDate = Date.parse(`${start.slice(0, 10)}T00:00:00Z`)

  const endDate = Date.parse(`${end.slice(0, 10)}T00:00:00Z`)

  if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) return ""

  const days = Math.max(0, Math.round((endDate - startDate) / 86_400_000))

  return minimumOne ? Math.max(1, days) : days
}

function humanize(value: string): string {
  return value.toLowerCase().replace(/_/g, " ")
}

function localDateInput(): string {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  return date.toISOString().slice(0, 10)
}

function displayDate(value: string): string {
  const [year, month, day] = value.split("-")
  return year && month && day ? `${day}/${month}/${year}` : value
}

export default function MovementsPage() {
  const [rows, setRows] = useState<Movement[]>([])

  const [vehicles, setVehicles] = useState<VehicleOption[]>([])

  const [error, setError] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)

  const [exportModalOpen, setExportModalOpen] = useState(false)

  const [exportMode, setExportMode] = useState<"all" | "range">("all")

  const [exportStartDate, setExportStartDate] = useState(localDateInput)

  const [exportEndDate, setExportEndDate] = useState(localDateInput)

  const [page, setPage] = useState(1)

  const [detail, setDetail] = useState<Movement | null>(null)

  const [deleting, setDeleting] = useState<Movement | null>(null)

  const [typeFilter, setTypeFilter] = useState<MovementType | "">("")

  const [query, setQuery] = useState("")

  const [datePeriod, setDatePeriod] = useState<DatePeriod>("all")

  const load = async () => {
    try {
      const [movementRows, vehicleRows] = await Promise.all([
        apiFetch<Movement[]>("/api/mouvements"),

        apiFetch<VehicleOption[]>("/api/vehicules"),
      ])

      setRows(movementRows)

      setVehicles(vehicleRows)

      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chargement impossible")
    }
  }

  useEffect(() => {
    void load()

    const timer = window.setInterval(() => void load(), 30_000)

    return () => window.clearInterval(timer)
  }, [])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return rows.filter(
      (row) =>
        (!typeFilter || row.type === typeFilter) &&
        matchesDatePeriod(row.date, datePeriod) &&
        (!needle ||
          `${vehicles.find((vehicle) => vehicle.id === row.vehiculeId)?.immatriculation ?? row.vehiculeId} ${row.type} ${row.motif ?? ""} ${row.commentaire ?? ""}`
            .toLowerCase()
            .includes(needle)),
    )
  }, [rows, vehicles, typeFilter, query, datePeriod])

  const visibleRows = useMemo(
    () =>
      filteredRows.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE),

    [page, filteredRows],
  )

  useEffect(() => {
    setPage(1)
  }, [typeFilter, query, datePeriod])

  useEffect(() => {
    if (page > Math.max(1, Math.ceil(filteredRows.length / TABLE_PAGE_SIZE))) {
      setPage(1)
    }
  }, [filteredRows.length, page])

  const remove = async () => {
    if (!deleting) return

    try {
      await apiFetch(`/api/mouvements/${deleting.id}`, { method: "DELETE" })

      setDeleting(null)

      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Suppression impossible")

      setDeleting(null)
    }
  }

  const exportJournal = async () => {
    if (
      exportMode === "range" &&
      (!exportStartDate ||
        !exportEndDate ||
        exportStartDate > exportEndDate)
    ) {
      setError("La date de début doit précéder ou égaler la date de fin.")
      return
    }

    setExportModalOpen(false)
    setExporting(true)

    setError(null)

    try {
      const [
        rentals,
        garagePassages,
        sales,
        vehicleRows,
        clients,
        commercials,
        movementRows,
      ] = await Promise.all([
        apiFetch<RentalExportRow[]>("/api/locations"),

        apiFetch<GarageExportRow[]>("/api/parc/passages-garage"),

        apiFetch<SaleExportRow[]>("/api/vehicules/ventes"),

        apiFetch<VehicleOption[]>("/api/vehicules"),

        apiFetch<NamedOption[]>("/api/clients"),

        apiFetch<NamedOption[]>("/api/commerciaux"),

        apiFetch<Movement[]>("/api/mouvements"),
      ])

      const vehicleById = new Map(
        vehicleRows.map((vehicle) => [vehicle.id, vehicle]),
      )

      const clientById = new Map(
        clients.map((client) => [client.id, client.nom]),
      )

      const commercialById = new Map(
        commercials.map((commercial) => [commercial.id, commercial.nom]),
      )

      const movementsByLocation = new Map<number, Movement[]>()

      const movementsByPassage = new Map<number, Movement[]>()

      for (const movement of movementRows) {
      if (movement.passageId != null) {
        const linked = movementsByPassage.get(movement.passageId) ?? []
        linked.push(movement)
        movementsByPassage.set(movement.passageId, linked)
      }

      if (movement.locationId == null) continue

        const linked = movementsByLocation.get(movement.locationId) ?? []

        linked.push(movement)

        movementsByLocation.set(movement.locationId, linked)
      }

      const exportRows: Array<{
        sortDate: string
        values: Array<string | number>
      }> = []

      const vehicleName = (id: number) => {
        const vehicle = vehicleById.get(id)

        return (
          vehicle?.marqueModele ??
          [vehicle?.marque, vehicle?.modele].filter(Boolean).join(" ")
        )
      }

      for (const rental of rentals) {
        const linkedMovements = movementsByLocation.get(rental.id) ?? []

        const departure = linkedMovements.find(
          (movement) => movement.type === "MISE_EN_LOCATION",
        )

        const returnMovement = linkedMovements.find(
          (movement) => movement.type === "RETOUR_LOCATION",
        )

        const departureDate = dateTimeParts(rental.dateDebut)

        const actualReturn = dateTimeParts(
          rental.dateRetourReelle ?? returnMovement?.date,
        )

        const departureKm = departure?.kilometrage ?? rental.kmDepart

        const returnKm = returnMovement?.kilometrage ?? rental.kmRetour

        const distance =
          rental.kmParcourus ??
          (departureKm != null && returnKm != null
            ? returnKm - departureKm
            : "")

        const clientName =
          rental.clientId == null ? "" : (clientById.get(rental.clientId) ?? "")

        const paymentStatus =
          rental.payeImport ??
          (rental.paye == null ? "" : rental.paye ? "Payée" : "Non Payée")

        exportRows.push({
          sortDate: rental.dateDebut,

          values: paddedJournalRow([
            0,
            vehicleById.get(rental.vehiculeId)?.immatriculation ?? "",
            vehicleName(rental.vehiculeId),

            departureDate.date,
            departureDate.time,
            "DIRECTION HERTZ",
            clientName,

            `Location - ${rental.type}`,

            rental.commercialId == null
              ? ""
              : (commercialById.get(rental.commercialId) ?? ""),

            departureKm ?? "",
            dateTimeParts(rental.dateFin).date,

            actualReturn.date,
            actualReturn.time,
            daysBetween(rental.dateDebut, rental.dateFin, true),

            returnKm ?? "",
            distance,
            "DIRECTION HERTZ",
            rental.commercialId == null
              ? ""
              : (commercialById.get(rental.commercialId) ?? ""),
            "",
            paymentStatus,
            clientName,

            [rental.reference, rental.statut, rental.observation]
              .filter(Boolean)
              .join(" - "),
          ]),
        })
      }

      for (const movement of movementRows.filter(
        (row) => row.type === "SORTIE_INTERNE",
      )) {
        const departureDate = dateTimeParts(movement.date)
        const returnDate = dateTimeParts(movement.dateRetour)
        const commercial =
          movement.commercialId == null
            ? ""
            : (commercialById.get(movement.commercialId) ?? "")
        const departureKm = movement.kmDepart ?? movement.kilometrage
        const returnKm = movement.kmRetour
        const distance =
          movement.kmParcourus ??
          (departureKm != null && returnKm != null
            ? returnKm - departureKm
            : "")

        exportRows.push({
          sortDate: movement.date,

          values: paddedJournalRow([
            0,
            vehicleById.get(movement.vehiculeId)?.immatriculation ?? "",
            vehicleName(movement.vehiculeId),

            departureDate.date,
            departureDate.time,
            "DIRECTION HERTZ",
            commercial,
            movement.motif ?? "",
            commercial,

            departureKm ?? "",
            "",
            returnDate.date,
            returnDate.time,
            movement.dateRetour
              ? daysBetween(movement.date, movement.dateRetour)
              : "",

            returnKm ?? "",
            distance,
            movement.dateRetour ? "DIRECTION HERTZ" : "",
            movement.validateurId == null
              ? ""
              : (commercialById.get(movement.validateurId) ?? ""),
            "",
            "",
            "",
            movement.commentaire ?? "",
          ]),
        })
      }

      for (const passage of garagePassages) {
        const passageMovements = movementsByPassage.get(passage.id) ?? []
        const departureMovement = passageMovements.find(
          (movement) => movement.type === "ENVOI_GARAGE",
        )
        const returnMovement = passageMovements.find(
          (movement) => movement.type === "RETOUR_GARAGE",
        )
        const departureDate = dateTimeParts(
          departureMovement?.date ?? passage.dateEntree,
        )
        const returnDate = dateTimeParts(
          returnMovement?.date ?? passage.dateSortieReelle,
        )

        const expectedDate = dateTimeParts(passage.dateSortiePrevue)

        exportRows.push({
          sortDate: departureMovement?.date ?? passage.dateEntree,

          values: paddedJournalRow([
            0,
            vehicleById.get(passage.vehiculeId)?.immatriculation ?? "",
            vehicleName(passage.vehiculeId),

            departureDate.date,
            departureDate.time,
            "DIRECTION HERTZ",
            "",

            [passage.typePassage, passage.motif].filter(Boolean).join(" - "),
            "",

            passage.kmEntree ?? "",
            expectedDate.date,
            returnDate.date,
            returnDate.time,

            passage.dateSortieReelle
              ? daysBetween(passage.dateEntree, passage.dateSortieReelle)
              : passage.dateSortiePrevue
                ? daysBetween(passage.dateEntree, passage.dateSortiePrevue)
                : "",

            "",
            "",
            passage.dateSortieReelle ? "DIRECTION HERTZ" : "",
            departureMovement?.validateurId == null
              ? ""
              : (commercialById.get(departureMovement.validateurId) ?? ""),
            "",
            "",
            "",

            [
              passage.garage,
              passage.statut,
              `${passage.coutTotal.toLocaleString("fr-FR")} FCFA`,
            ]

              .filter(Boolean)
              .join(" - "),
          ]),
        })
      }

      for (const sale of sales.filter((item) => item.statut === "CONCLUE")) {
        const departureValue = sale.dateRemiseVehicule ?? sale.dateVente

        const departureDate = dateTimeParts(departureValue)

        const buyer = clientById.get(sale.acheteurId) ?? ""

        const observation = [
          `Vente ${sale.numeroVente}`,

          `${sale.prixVente.toLocaleString("fr-FR")} ${sale.devise}`,

          `État : ${humanize(sale.etatVehicule)}`,

          sale.referenceCession ? `Cession : ${sale.referenceCession}` : "",

          sale.observation ?? "",
        ]
          .filter(Boolean)
          .join(" - ")

        exportRows.push({
          sortDate: departureValue,

          values: paddedJournalRow([
            0,
            vehicleById.get(sale.vehiculeId)?.immatriculation ?? "",
            vehicleName(sale.vehiculeId),

            departureDate.date,
            departureDate.time,
            "DIRECTION HERTZ",
            buyer,

            humanize(sale.motifVente),

            sale.commercialId == null
              ? ""
              : (commercialById.get(sale.commercialId) ?? ""),

            sale.kilometrageVente,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            sale.commercialId == null
              ? ""
              : (commercialById.get(sale.commercialId) ?? ""),
            "",
            humanize(sale.statutPaiement),
            buyer,
            observation,
          ]),
        })
      }

      const selectedRows =
        exportMode === "range"
          ? exportRows.filter((row) => {
              const date = row.sortDate.slice(0, 10)
              return date >= exportStartDate && date <= exportEndDate
            })
          : exportRows

      selectedRows.sort((a, b) => b.sortDate.localeCompare(a.sortDate))

      const today = new Date()

      const dateLabel = today.toLocaleDateString("fr-FR")

      const dateFile = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

      const dateRow = Array<string | number>(JOURNAL_COLUMN_COUNT).fill("")

      dateRow[0] = "Aujourd'hui le"

      dateRow[2] = dateLabel

      const titleRow = Array<string | number>(JOURNAL_COLUMN_COUNT).fill("")

      const periodSuffix =
        exportMode === "range"
          ? ` DU ${displayDate(exportStartDate)} AU ${displayDate(exportEndDate)}`
          : ""

      titleRow[0] = `JOURNAL DES MOUVEMENTS${periodSuffix}`

      const noteRow = Array<string | number>(JOURNAL_COLUMN_COUNT).fill("")

      noteRow[18] = "Contraventions sur le véhicule à son retour"

      const filenamePeriod =
        exportMode === "range"
          ? `-${exportStartDate}-au-${exportEndDate}`
          : ""

      downloadCsv(`export-journal-mouvements${filenamePeriod}-${dateFile}.csv`, [
        dateRow,

        Array<string | number>(JOURNAL_COLUMN_COUNT).fill(""),

        titleRow,

        noteRow,

        paddedJournalRow(journalHeaders),

        ...selectedRows.map((row, index) => {
          const values = [...row.values]

          values[0] = index + 1

          return values
        }),
      ])
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Export des mouvements impossible",
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div>
          <h2>Mouvements véhicules</h2>
          <p>{filteredRows.length} éléments affichés</p>
        </div>
        <div>
          <input
            className="table-search"
            placeholder="Rechercher…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <DatePeriodFilter value={datePeriod} onChange={setDatePeriod} />
          <select
            className="secondary status-filter"
            aria-label="Filtrer par type de mouvement"
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value as MovementType | "")
            }
          >
            <option value="">Tous les types</option>
            {movementTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            className="primary small"
            type="button"
            onClick={() => {
              setError(null)
              setExportModalOpen(true)
            }}
            disabled={exporting}
          >
            {exporting ? "Préparation…" : "Exporter CSV"}
          </button>
        </div>
      </div>
      {exportModalOpen && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(event) => {
              event.preventDefault()
              void exportJournal()
            }}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setExportModalOpen(false)}
              aria-label="Fermer"
            >
              <Icon name="close" />
            </button>
            <p className="kicker">EXPORT DES MOUVEMENTS</p>
            <h2>Choisir la période</h2>
            <div className="modal-fields">
              <label>
                <span>Période à exporter</span>
                <select
                  value={exportMode}
                  onChange={(event) =>
                    setExportMode(event.target.value as "all" | "range")
                  }
                >
                  <option value="all">Tous les mouvements</option>
                  <option value="range">Entre deux dates</option>
                </select>
              </label>
              {exportMode === "range" && (
                <>
                  <label>
                    <span>Date de début</span>
                    <input
                      type="date"
                      value={exportStartDate}
                      onChange={(event) => setExportStartDate(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>Date de fin</span>
                    <input
                      type="date"
                      value={exportEndDate}
                      onChange={(event) => setExportEndDate(event.target.value)}
                      required
                    />
                  </label>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setExportModalOpen(false)}
              >
                Annuler
              </button>
              <button className="primary small" type="submit">
                Exporter CSV
              </button>
            </div>
          </form>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Véhicule</th>
              <th>Type</th>
              <th>Motif</th>
              <th>Km départ</th>
              <th>Km retour</th>
              <th>Km parcourus</th>
              <th>Observation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>
                  {vehicles.find((vehicle) => vehicle.id === row.vehiculeId)
                    ?.immatriculation ?? `#${row.vehiculeId}`}
                </td>
                <td>{row.type}</td>
                <td>{row.motif ?? "—"}</td>
                <td>
                  {row.kmDepart == null
                    ? "—"
                    : `${row.kmDepart.toLocaleString("fr-FR")} km`}
                </td>
                <td>
                  {row.kmRetour == null
                    ? "—"
                    : `${row.kmRetour.toLocaleString("fr-FR")} km`}
                </td>
                <td>
                  {row.kmParcourus == null
                    ? "—"
                    : `${row.kmParcourus.toLocaleString("fr-FR")} km`}
                </td>
                <td>{row.commentaire ?? "—"}</td>
                <td className="actions">
                  <button
                    title="Voir les détails"
                    aria-label="Voir les détails"
                    onClick={() => setDetail(row)}
                  >
                    <Icon name="eye" size={17} />
                  </button>
                  <button
                    className="action-delete"
                    title="Supprimer"
                    aria-label="Supprimer"
                    onClick={() => setDeleting(row)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page}
        total={filteredRows.length}
        onChange={setPage}
      />
      {detail && (
        <DetailModal
          title={`Mouvement #${detail.id}`}
          subtitle={
            vehicles.find((vehicle) => vehicle.id === detail.vehiculeId)
              ?.immatriculation ?? `Véhicule #${detail.vehiculeId}`
          }
          fields={[
            { label: "Date", value: detail.date },
            { label: "Type", value: detail.type },

            { label: "Motif", value: detail.motif ?? "—" },

            {
              label: "Km départ",
              value:
                detail.kmDepart == null
                  ? "—"
                  : `${detail.kmDepart.toLocaleString("fr-FR")} km`,
            },
            {
              label: "Km retour",
              value:
                detail.kmRetour == null
                  ? "—"
                  : `${detail.kmRetour.toLocaleString("fr-FR")} km`,
            },
            {
              label: "Km parcourus",
              value:
                detail.kmParcourus == null
                  ? "—"
                  : `${detail.kmParcourus.toLocaleString("fr-FR")} km`,
            },

            { label: "Observation", value: detail.commentaire ?? "—" },
          ]}
          close={() => setDetail(null)}
        />
      )}
      {deleting && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="kicker">CONFIRMATION</p>
            <h2>Supprimer ce mouvement ?</h2>
            <p>Cette action est définitive.</p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setDeleting(null)}>
                Annuler
              </button>
              <button className="danger" onClick={() => void remove()}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
