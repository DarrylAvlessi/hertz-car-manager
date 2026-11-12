import { useEffect, useMemo, useRef, useState } from "react"

import type { ChangeEvent } from "react"

import { useOutletContext } from "react-router-dom"

import Icon from "@/shared/components/Icon"

import DetailModal from "@/shared/components/DetailModal"
import SearchableSelect from "@/shared/components/SearchableSelect"

import { apiFetch } from "@/shared/api/client"

import { notifyDashboardMutation } from "@/shared/components/dashboardNotifications"
import { canUseVehicleForNewOperation } from "@/shared/data/vehicleStatus"

import { downloadCsv } from "@/shared/data/csv"

import TablePagination, {
  TABLE_PAGE_SIZE,
} from "../components/TablePagination"
import DatePeriodFilter, {
  matchesDatePeriod,
  type DatePeriod,
} from "../components/DatePeriodFilter"
import type { DashboardOutletContext } from "../DashboardLayout"

async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder("windows-1252").decode(buffer)
  }
}

type Location = {
  id: number

  reference: string

  clientId: number

  vehiculeId: number

  commercialId: number | null

  type: "Courte durée" | "Longue durée"

  dateDebut: string

  dateFin: string

  dateRetourReelle: string | null

  kmDepart: number

  kmRetour: number | null

  kmParcourus: number | null

  montant: number

  statut: "EN_COURS" | "TERMINEE" | "EN_RETARD" | "EN_PROLONGATION"

  observation?: string | null

  modePaiement?: string | null

  referenceFacture?: string | null

  dateFacturation?: string | null

  paye?: boolean | null

  payeImport?: string | null

  datePaiement?: string | null
}

type ProlongationForm = {
  ancienneDateFin: string

  nouvelleDateFin: string

  dateDemande: string

  motif: string

  montantSupplementaire: string
}

type Option = {
  id: number
  nom?: string
  contact?: string
  immatriculation?: string
  statut?: string
}

const locationCsvHeaders = [
  "Nom du client",

  "Immat. Véhicule",

  "Début",

  "Fin",

  "Durée",

  "Mode de paiement",

  "Réf. Facture",

  "Date facturation",

  "Montant",

  "PAYE",

  "Date de paiement",

  "Commercial",

  "Observation",

  "Type de location",

  "Statut",
]

function csvDate(value: string | null | undefined): string {
  if (!value) return ""

  const [year, month, day] = value.slice(0, 10).split("-")

  return year && month && day ? `${day}/${month}/${year}` : ""
}

function rentalDuration(start: string, end: string): number {
  const startDate = Date.parse(`${start.slice(0, 10)}T00:00:00Z`)

  const endDate = Date.parse(`${end.slice(0, 10)}T00:00:00Z`)

  return Number.isFinite(startDate) && Number.isFinite(endDate)
    ? Math.max(1, Math.round((endDate - startDate) / 86_400_000))
    : 0
}

function exportDate(value: string): string {
  const [year, month, day] = value.split("-")
  return year && month && day ? `${day}/${month}/${year}` : value
}

const empty = {
  reference: "",

  clientId: "",

  vehiculeId: "",

  commercialId: "",

  type: "Courte durée",

  dateDebut: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16),

  dateFin: new Date(
    Date.now() + 86400000 - new Date().getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16),

  dateRetourReelle: "",

  kmRetour: "",

  kmDepart: "0",

  montant: "0",

  statut: "EN_COURS",
}

function displayDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16)
}

function effectiveStatus(location: Location): Location["statut"] {
  if (location.statut === "EN_COURS" || location.statut === "EN_PROLONGATION") {
    const end = Date.parse(location.dateFin.replace(" ", "T"))

    if (Number.isFinite(end) && end < Date.now()) return "EN_RETARD"
  }

  return location.statut
}

export default function LocationsPage() {
  const { setPageActions } = useOutletContext<DashboardOutletContext>()
  const [rows, setRows] = useState<Location[]>([])

  const [clients, setClients] = useState<Option[]>([])

  const [commercials, setCommercials] = useState<Option[]>([])

  const [vehicles, setVehicles] = useState<Option[]>([])

  const [form, setForm] = useState<typeof empty | null>(null)

  const [editing, setEditing] = useState<Location | null>(null)

  const [detail, setDetail] = useState<Location | null>(null)

  const [deleting, setDeleting] = useState<Location | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState("")

  const [page, setPage] = useState(1)

  const [statusFilter, setStatusFilter] = useState("")

  const [typeFilter, setTypeFilter] = useState("")

  const [datePeriod, setDatePeriod] = useState<DatePeriod>("all")

  const [prolongation, setProlongation] = useState<ProlongationForm | null>(
    null,
  )

  const [prolongationConfirmed, setProlongationConfirmed] = useState(false)

  const [completionModalOpen, setCompletionModalOpen] = useState(false)

  const [importingCsv, setImportingCsv] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportMode, setExportMode] = useState<"all" | "range">("all")
  const [exportStartDate, setExportStartDate] = useState("")
  const [exportEndDate, setExportEndDate] = useState("")

  const csvInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      const [locations, clientRows, commercialRows, vehicleRows] =
        await Promise.all([
          apiFetch<Location[]>("/api/locations"),

          apiFetch<Option[]>("/api/clients"),

          apiFetch<Option[]>("/api/commerciaux"),

          apiFetch<Option[]>("/api/vehicules"),
        ])

      setRows(locations)

      setClients(clientRows)

      setCommercials(commercialRows)

      setVehicles(vehicleRows)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible")
    }
  }

  useEffect(() => {
    void load()

    const timer = window.setInterval(() => void load(), 60_000)

    return () => window.clearInterval(timer)
  }, [])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return rows.filter(
      (row) =>
        (!needle ||
          `${row.reference} ${row.clientId} ${row.vehiculeId} ${row.type} ${row.statut}`
            .toLowerCase()
            .includes(needle)) &&
        (!statusFilter || effectiveStatus(row) === statusFilter) &&
        (!typeFilter || row.type === typeFilter) &&
        matchesDatePeriod(row.dateDebut, datePeriod),
    )
  }, [rows, query, statusFilter, typeFilter, datePeriod])

  const visibleRows = filteredRows.slice(
    (page - 1) * TABLE_PAGE_SIZE,
    page * TABLE_PAGE_SIZE,
  )

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, typeFilter, datePeriod])

  useEffect(() => {
    if (page > Math.max(1, Math.ceil(filteredRows.length / TABLE_PAGE_SIZE))) {
      setPage(1)
    }
  }, [page, filteredRows.length])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!form) return

    if (prolongation && !prolongationConfirmed) {
      setError(
        "Validez les informations de prolongation avant d’enregistrer la location.",
      )

      return
    }

    if (
      form.statut === "TERMINEE" &&
      (form.kmRetour === "" || Number(form.kmRetour) < Number(form.kmDepart))
    ) {
      setCompletionModalOpen(true)
      setError("Saisissez le kilométrage de retour avant d'enregistrer.")
      return
    }

    try {
      const body = {
        reference: form.reference || null,

        clientId: Number(form.clientId),

        vehiculeId: Number(form.vehiculeId),

        commercialId: form.commercialId ? Number(form.commercialId) : null,

        type: form.type,

        dateDebut: form.dateDebut,

        dateFin: form.dateFin,

        montant: Number(form.montant),

        statut: form.statut,

        kmRetour:
          form.statut === "TERMINEE" ? Number(form.kmRetour) : null,

        ...(prolongation &&
          prolongationConfirmed && {
            prolongation: {
              ...prolongation,

              montantSupplementaire: Number(prolongation.montantSupplementaire),

              commercialId: form.commercialId
                ? Number(form.commercialId)
                : null,
            },
          }),
      }

      await apiFetch(
        editing ? `/api/locations/${editing.id}` : "/api/locations",
        {
          method: editing ? "PUT" : "POST",

          body,
        },
      )

      setForm(null)

      setEditing(null)

      setProlongation(null)

      setProlongationConfirmed(false)

      await load()

      notifyDashboardMutation(
        editing
          ? "Location modifiée avec succès."
          : "Location enregistrée avec succès.",
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible")
    }
  }

  const remove = async () => {
    if (!deleting) return

    try {
      await apiFetch(`/api/locations/${deleting.id}`, { method: "DELETE" })

      setDeleting(null)

      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible")
    }
  }

  const open = (location?: Location) => {
    setEditing(location ?? null)

    setForm(
      location
        ? {
            reference: location.reference,

            clientId: String(location.clientId),

            vehiculeId: String(location.vehiculeId),

            commercialId: location.commercialId
              ? String(location.commercialId)
              : "",

            type: location.type,

            dateDebut: location.dateDebut,

            dateFin: location.dateFin,

            dateRetourReelle:
              location.dateRetourReelle?.replace(" ", "T").slice(0, 16) ?? "",

            kmRetour:
              location.kmRetour === null ? "" : String(location.kmRetour),

            kmDepart: String(location.kmDepart),

            montant: String(location.montant),

            statut: location.statut,
          }
        : { ...empty },
    )

    setProlongation(null)

    setProlongationConfirmed(false)

    setCompletionModalOpen(false)
  }

  const downloadCsvTemplate = () => {
    downloadCsv("modele-import-locations.csv", [
      locationCsvHeaders,

      [
        "EXEMPLE - À remplacer",

        "EXEMPLE",

        "01/01/2026",

        "02/01/2026",

        1,

        "TPE",

        "EXEMPLE",

        "01/01/2026",

        30000,

        "Oui",

        "01/01/2026",

        "COMM-001",

        "Location professionnelle",

        "Courte durée",

        "EN_COURS",
      ],
      [
        "HERTZ BENIN",
        "AB 1234 RB",
        "05/02/2026",
        "08/02/2026",
        3,
        "Virement",
        "FACT-2026-002",
        "08/02/2026",
        90000,
        "Non",
        "N/A",
        "COMM-002",

        "Déplacement professionnel",

        "Longue durée",

        "TERMINEE",
      ],
    ])
  }

  const exportLocationsCsv = () => {
    if (exportMode === "range" && (!exportStartDate || !exportEndDate || exportStartDate > exportEndDate)) {
      setError("La période sélectionnée est invalide.")
      return
    }
    const selectedRows = exportMode === "range"
      ? rows.filter((location) => location.dateDebut.slice(0, 10) >= exportStartDate && location.dateDebut.slice(0, 10) <= exportEndDate)
      : rows
    const data = selectedRows.map((location) => [
      clients.find((client) => client.id === location.clientId)?.nom ?? "",

      vehicles.find((vehicle) => vehicle.id === location.vehiculeId)
        ?.immatriculation ?? "",

      csvDate(location.dateDebut),

      csvDate(location.dateFin),

      rentalDuration(location.dateDebut, location.dateFin),

      location.modePaiement ?? "",

      location.referenceFacture ?? "",

      csvDate(location.dateFacturation),

      location.montant,

      location.payeImport ?? (location.paye ? "Oui" : "Non"),

      csvDate(location.datePaiement),

      commercials.find((commercial) => commercial.id === location.commercialId)
        ?.nom ?? "",

      location.observation ?? "",

      location.type,

      location.statut,
    ])

    const suffix = exportMode === "range" ? `-${exportStartDate}-au-${exportEndDate}` : ""
    const title = exportMode === "range"
      ? `LOCATIONS DU ${exportDate(exportStartDate)} AU ${exportDate(exportEndDate)}`
      : "LOCATIONS"
    setExportModalOpen(false)
    downloadCsv(`export-locations${suffix}.csv`, [[title], locationCsvHeaders, ...data])
  }

  const importLocationsCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.currentTarget

    const file = inputElement.files?.[0]

    if (!file) return

    setImportingCsv(true)

    setError(null)

    try {
      const result = await apiFetch<{ created: number }>(
        "/api/locations/import-csv",
        {
          method: "POST",

          body: { csv: await readCsvFile(file) },
        },
      )

      await load()

      notifyDashboardMutation(
        `Import terminé : ${result.created} location(s) enregistrée(s), avec les données de facturation et de paiement.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import CSV impossible")
    } finally {
      setImportingCsv(false)

      inputElement.value = ""
    }
  }

  useEffect(() => {
    setPageActions(
      <div className="vehicle-csv-actions locations-csv-actions">
        <button
          type="button"
          className="secondary vehicle-csv-button"
          onClick={downloadCsvTemplate}
        >
          Modèle CSV
        </button>
        <button
          type="button"
          className="secondary vehicle-csv-button"
          onClick={() => csvInput.current?.click()}
          disabled={importingCsv}
        >
          {importingCsv ? "Import…" : "Importer CSV"}
        </button>
        <button
          type="button"
          className="primary small vehicle-csv-button"
          onClick={() => setExportModalOpen(true)}
        >
          Exporter CSV
        </button>
        <input
          ref={csvInput}
          type="file"
          accept=".csv,text/csv"
          aria-label="Sélectionner un fichier CSV de locations"
          hidden
          onChange={(event) => void importLocationsCsv(event)}
        />
      </div>,
    )

    return () => setPageActions(null)
  }, [setPageActions, importingCsv, rows, clients, vehicles, commercials])

  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div>
          <h2>Gestion des locations</h2>
          <p>{filteredRows.length} éléments affichés</p>
        </div>
        {exportModalOpen && (
          <div className="modal-backdrop">
            <form className="modal" onSubmit={(event) => { event.preventDefault(); exportLocationsCsv() }}>
              <button className="modal-close" type="button" onClick={() => setExportModalOpen(false)} aria-label="Fermer"><Icon name="close" /></button>
              <p className="kicker">EXPORT DES LOCATIONS</p><h2>Choisir la période</h2>
              <div className="modal-fields">
                <label><span>Période</span><select value={exportMode} onChange={(event) => setExportMode(event.target.value as "all" | "range")}><option value="all">Toutes les locations</option><option value="range">Entre deux dates</option></select></label>
                {exportMode === "range" && <><label><span>Date de début</span><input type="date" required value={exportStartDate} onChange={(event) => setExportStartDate(event.target.value)} /></label><label><span>Date de fin</span><input type="date" required value={exportEndDate} onChange={(event) => setExportEndDate(event.target.value)} /></label></>}
              </div>
              <div className="modal-actions"><button type="button" className="secondary" onClick={() => setExportModalOpen(false)}>Annuler</button><button className="primary small">Exporter CSV</button></div>
            </form>
          </div>
        )}
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
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="">Tous les types</option>
            <option>Courte durée</option>
            <option>Longue durée</option>
          </select>
          <select
            className="secondary status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Tous les statuts</option>
            <option value="EN_COURS">En cours</option>
            <option value="EN_RETARD">En retard</option>
            <option value="EN_PROLONGATION">En prolongation</option>
            <option value="TERMINEE">Retourné</option>
          </select>
          <button className="primary small" onClick={() => open()}>
            <Icon name="plus" size={17} /> Ajouter
          </button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Contrat</th>
              <th>Client</th>
              <th>Véhicule</th>
              <th>Type</th>
              <th>Échéance</th>
              <th>État</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.reference}</strong>
                </td>
                <td>
                  {clients.find((item) => item.id === row.clientId)?.nom ??
                    row.clientId}
                </td>
                <td>
                  {vehicles.find((item) => item.id === row.vehiculeId)
                    ?.immatriculation ?? row.vehiculeId}
                </td>
                <td>{row.type}</td>
                <td>{displayDateTime(row.dateFin)}</td>
                <td>{effectiveStatus(row)}</td>
                <td className="actions">
                  <button title="Voir" onClick={() => setDetail(row)}>
                    <Icon name="eye" size={17} />
                  </button>
                  <button
                    className="action-edit"
                    title="Modifier"
                    onClick={() => open(row)}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    className="action-delete"
                    title="Supprimer"
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
      {form && (
        <div className="modal-backdrop">
          <form className="modal location-modal" onSubmit={save}>
            <button
              className="modal-close"
              type="button"
              onClick={() => setForm(null)}
            >
              <Icon name="close" />
            </button>
            <p className="kicker">LOCATION</p>
            <h2>{editing ? "Modifier la location" : "Ajouter une location"}</h2>
            <div className="modal-fields">
              <label>
                <span>Référence</span>
                <input
                  value={form.reference}
                  onChange={(e) =>
                    setForm({ ...form, reference: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Client</span>
                <SearchableSelect
                  required
                  value={form.clientId}
                  onChange={(value) => setForm({ ...form, clientId: value })}
                  options={clients.map((item) => ({
                    value: String(item.id),
                    label: item.nom ?? String(item.id),
                  }))}
                  placeholder="Rechercher un client…"
                />
                <small>
                  Une nouvelle location nécessite un véhicule en entrée au parc
                  ou de retour.
                </small>
              </label>
              <label>
                <span>Véhicule</span>
                <SearchableSelect
                  required
                  value={form.vehiculeId}
                  onChange={(value) => setForm({ ...form, vehiculeId: value })}
                  options={vehicles.map((item) => ({
                    value: String(item.id),
                    label: `${item.immatriculation ?? item.id} · ${item.statut ?? "STATUT INCONNU"}`,
                    searchText: item.statut,
                    disabled:
                      editing?.vehiculeId !== item.id &&
                      !canUseVehicleForNewOperation(item.statut),
                  }))}
                  placeholder="Rechercher un véhicule…"
                />
              </label>
              <label>
                <span>Commercial</span>
                <SearchableSelect
                  required
                  value={form.commercialId}
                  onChange={(value) => setForm({ ...form, commercialId: value })}
                  options={commercials.map((item) => ({
                    value: String(item.id),
                    label: item.nom ?? String(item.id),
                  }))}
                  placeholder="Rechercher un commercial…"
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      type: e.target.value as typeof form.type,
                    })
                  }
                >
                  <option>Courte durée</option>
                  <option>Longue durée</option>
                </select>
              </label>
              <label>
                <span>Date et heure de début</span>
                <input
                  type="datetime-local"
                  required
                  value={form.dateDebut.replace(" ", "T").slice(0, 16)}
                  onChange={(e) =>
                    setForm({ ...form, dateDebut: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Date et heure de fin</span>
                <input
                  type="datetime-local"
                  required
                  value={form.dateFin.replace(" ", "T").slice(0, 16)}
                  onChange={(e) =>
                    setForm({ ...form, dateFin: e.target.value })
                  }
                />
              </label>
              {editing && (
                <label>
                  <span>Date et heure du retour réel</span>
                  <input
                    type="datetime-local"
                    value={form.dateRetourReelle}
                    readOnly
                  />
                </label>
              )}
              <label>
                <span>Montant</span>
                <input
                  type="number"
                  min="0"
                  value={form.montant}
                  onChange={(e) =>
                    setForm({ ...form, montant: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Statut</span>
                <select
                  value={form.statut}
                  onChange={(e) => {
                    const statut = e.target.value as typeof form.statut

                    const now = new Date(
                      Date.now() - new Date().getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)

                    setForm({
                      ...form,

                      statut,

                      dateRetourReelle:
                        statut === "TERMINEE"
                          ? form.dateRetourReelle || now
                          : "",
                    })

                    if (statut === "TERMINEE") {
                      setCompletionModalOpen(true)
                    }

                    setProlongationConfirmed(false)

                    if (statut === "EN_PROLONGATION" && editing) {
                      setProlongation({
                        ancienneDateFin: editing.dateFin
                          .replace(" ", "T")
                          .slice(0, 16),

                        nouvelleDateFin: "",

                        dateDemande: now,

                        motif: "",

                        montantSupplementaire: "",
                      })
                    } else {
                      setProlongation(null)
                    }
                  }}
                >
                  <option value="EN_COURS">EN_COURS</option>
                  <option value="TERMINEE">TERMINEE</option>
                  <option value="EN_RETARD">EN_RETARD</option>
                  <option value="EN_PROLONGATION">EN_PROLONGATION</option>
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setForm(null)}
              >
                Annuler
              </button>
              <button className="primary small">Enregistrer</button>
            </div>
          </form>
          {completionModalOpen && form.statut === "TERMINEE" && (
            <div className="modal-backdrop">
              <form
                className="modal"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (
                    !form.kmRetour ||
                    Number(form.kmRetour) < Number(form.kmDepart)
                  ) {
                    setError("Saisissez un kilométrage de retour valide.")
                    return
                  }
                  setError(null)
                  setCompletionModalOpen(false)
                }}
              >
                <button
                  className="modal-close"
                  type="button"
                  onClick={() => setCompletionModalOpen(false)}
                  aria-label="Fermer"
                >
                  <Icon name="close" />
                </button>
                <p className="kicker">RETOUR DE LOCATION</p>
                <h2>Renseigner le kilométrage de retour</h2>
                <p>
                  Kilométrage au départ :{" "}
                  <strong>{form.kmDepart || "Non renseigné"} km</strong>
                </p>
                <label>
                  <span>Kilométrage de retour</span>
                  <input
                    type="number"
                    min={form.kmDepart}
                    value={form.kmRetour}
                    onChange={(event) =>
                      setForm({ ...form, kmRetour: event.target.value })
                    }
                    required
                    autoFocus
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setCompletionModalOpen(false)}
                  >
                    Annuler
                  </button>
                  <button className="primary small" type="submit">
                    Valider
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
      {prolongation && form && !prolongationConfirmed && (
        <div className="modal-backdrop">
          <div className="modal location-modal">
            <button
              className="modal-close"
              type="button"
              onClick={() => {
                setProlongation(null)

                setProlongationConfirmed(false)

                setForm((current) =>
                  current
                    ? { ...current, statut: editing?.statut ?? "EN_COURS" }
                    : current,
                )
              }}
            >
              <Icon name="close" />
            </button>
            <p className="kicker">PROLONGATION</p>
            <h2>Informations de prolongation</h2>
            <div className="modal-fields">
              <label>
                <span>Ancienne date de fin</span>
                <input
                  type="datetime-local"
                  value={prolongation.ancienneDateFin}
                  readOnly
                />
              </label>
              <label>
                <span>Date de demande</span>
                <input
                  type="datetime-local"
                  value={prolongation.dateDemande}
                  readOnly
                />
              </label>
              <label>
                <span>Nouvelle date de fin</span>
                <input
                  type="datetime-local"
                  required
                  value={prolongation.nouvelleDateFin}
                  onChange={(e) =>
                    setProlongation({
                      ...prolongation,
                      nouvelleDateFin: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                <span>Motif</span>
                <textarea
                  required
                  value={prolongation.motif}
                  onChange={(e) =>
                    setProlongation({ ...prolongation, motif: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Montant supplémentaire</span>
                <input
                  type="number"
                  min="0"
                  required
                  value={prolongation.montantSupplementaire}
                  onChange={(e) =>
                    setProlongation({
                      ...prolongation,
                      montantSupplementaire: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setProlongation(null)

                  setProlongationConfirmed(false)

                  setForm((current) =>
                    current
                      ? { ...current, statut: editing?.statut ?? "EN_COURS" }
                      : current,
                  )
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="primary small"
                disabled={
                  !prolongation.nouvelleDateFin ||
                  !prolongation.motif.trim() ||
                  !prolongation.montantSupplementaire
                }
                onClick={() => {
                  setForm((current) =>
                    current
                      ? { ...current, dateFin: prolongation.nouvelleDateFin }
                      : current,
                  )

                  setProlongationConfirmed(true)
                }}
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      )}
      {detail && (
        <DetailModal
          title={detail.reference}
          subtitle="Location"
          fields={[
            { label: "Référence", value: detail.reference },

            {
              label: "Client",

              value:
                clients.find((item) => item.id === detail.clientId)?.nom ??
                "Client introuvable",
            },

            {
              label: "Véhicule",

              value:
                vehicles.find((item) => item.id === detail.vehiculeId)
                  ?.immatriculation ?? "Véhicule introuvable",
            },

            {
              label: "Commercial",

              value: detail.commercialId
                ? (commercials.find((item) => item.id === detail.commercialId)
                    ?.nom ?? "Commercial introuvable")
                : "—",
            },

            { label: "Type", value: detail.type },

            {
              label: "Date et heure de début",
              value: displayDateTime(detail.dateDebut),
            },

            {
              label: "Date et heure de fin",
              value: displayDateTime(detail.dateFin),
            },

            {
              label: "Date et heure du retour réel",
              value: detail.dateRetourReelle
                ? displayDateTime(detail.dateRetourReelle)
                : "—",
            },

            {
              label: "Montant",
              value: `${detail.montant.toLocaleString("fr-FR")} FCFA`,
            },

            { label: "Statut", value: effectiveStatus(detail) },
          ]}
          close={() => setDetail(null)}
        />
      )}
      {deleting && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Supprimer cette location ?</h2>
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
