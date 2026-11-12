import { useEffect, useMemo, useRef, useState } from "react"

import type { ChangeEvent } from "react"
import { useOutletContext } from "react-router-dom"

import Icon from "@/shared/components/Icon"

import DetailModal from "@/shared/components/DetailModal"

import StatusBadge from "@/shared/components/StatusBadge"

import { apiFetch, exportUrl } from "@/shared/api/client"

import { notifyDashboardMutation } from "@/shared/components/dashboardNotifications"

import { downloadCsv, parseCsv } from "@/shared/data/csv"

import {
  fetchTable,
  filterTable,
  type CommercialFicheDto,
  type ReservationFicheDto,
  type TableResult,
} from "@/shared/data/dashboardService"

import type { TableModule } from "@/shared/data/types"

import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"

import ClientCommercialModal from "../components/ClientCommercialModal"
import ReservationModal from "../components/ReservationModal"
import type { DashboardOutletContext } from "../DashboardLayout"

type ManagedModule = "Clients" | "Commerciaux"

const clientCsvHeaders = [
  "Nom",
  "Prenom",
  "Type",
  "Telephone",
  "Email",
  "Adresse",
  "Numéro de permis",
]

const clientTypes = new Set(["Particulier", "Entreprise", "Organisation"])

const clientCsvExamples = [
  [
    "ARCS BENIN",
    "Koffi",
    "Entreprise",
    "+229 97 00 11 22",
    "contact@arcs.bj",
    "Cotonou",
    "PERMIS-AB-12345",
  ],
  [
    "HERTZ BENIN",
    "Aïcha",
    "Organisation",
    "+229 96 33 44 55",
    "aicha@hertz.bj",
    "Porto-Novo",
    "PERMIS-AB-67890",
  ],
]

const commercialCsvHeaders = [
  "Prenom",
  "NOM",
  "Abreviations",
  "Agence",
  "Code Agence",
  "Telephone",
  "Email",
]

const commercialCsvExamples = [
  [
    "EXEMPLE - Ulrich",
    "ADOKO",
    "UA",
    "Agence principale",
    "APS",
    "+229 97 11 22 33",
    "ulrich.adoko@example.com",
  ],
  [
    "EXEMPLE - Deborah",
    "PADONOU",
    "DP",
    "Agence aéroport",
    "ABC",
    "+229 96 44 55 66",
    "deborah.padonou@example.com",
  ],
]

const reservationCsvHeaders = [
  "Immatriculation",
  "Véhicule",
  "Agent de vente",
  "Date de Résa",
  "Date de début",
  "Date prévu de retour",
  "Durée (j)",
  "Mission",
  "Lieu de la mission",
  "Client",
  "Statut de confirmation",
  "Statut de la résa",
  "Statut de la facturation",
]

const lostAffairsCsvHeaders = [
  "N°",
  "AGENT DE VENTE",
  "REF PROFORMA",
  "DATE DE REZA",
  "CLIENT",
  "REF DON DE CMD",
  "RELANCE",
  "DATE D'ANNULATION",
  "MOTIF D'ANNULATION",
  "VEHICULE DEMANDE",
  "VEHICULE PROPOSE",
]

const reservationCsvExamples = [
  [
    "AA 0000 AA",
    "EXEMPLE - Véhicule",
    "EXEMPLE",
    "06/12/2026",
    "05/12/2026",
    "08/12/2026",
    "3",
    "Mission exemple",
    "COTONOU",
    "EXEMPLE - Client",
    "Confirmée",
    "À venir",
    "En attente de bon de commande",
  ],
  [
    "AB 1234 RB",
    "EXEMPLE - Nissan Kicks",
    "EXEMPLE - Ulrich ADOKO",
    "07/12/2026",
    "10/12/2026",
    "12/12/2026",
    "2",
    "Déplacement professionnel",
    "Porto-Novo",
    "EXEMPLE - ARCS BENIN",
    "À confirmer",
    "À venir",
    "Paiement effectué",
  ],
]

function todayCsvDate(): string {
  const today = new Date()
  return `${String(today.getDate()).padStart(2, "0")}/${String(
    today.getMonth() + 1,
  ).padStart(2, "0")}/${today.getFullYear()}`
}

const downloadClientTemplate = () => {
  downloadCsv("modele-import-clients.csv", [
    clientCsvHeaders,
    ...clientCsvExamples,
  ])
}

function csvDate(value: string | null | undefined): string {
  if (!value) return ""
  const [year, month, day] = value.slice(0, 10).split("-")
  return year && month && day ? `${day}/${month}/${year}` : ""
}

async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder("windows-1252").decode(buffer)
  }
}

export default function GenericTablePage({
  module,

  query,

  refreshKey,

  onAdd,
}: {
  module: TableModule

  query: string

  refreshKey: number

  onAdd: () => void
}) {
  const { setPageActions } = useOutletContext<DashboardOutletContext>()
  const [data, setData] = useState<TableResult | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)

  const [localSearch, setLocalSearch] = useState("")

  const [statusFilter, setStatusFilter] = useState("")

  const [statusSort, setStatusSort] = useState<"" | "asc" | "desc">("")

  const [localRefreshKey, setLocalRefreshKey] = useState(0)

  const [selectedRecord, setSelectedRecord] = useState<{
    id: number

    mode: "details" | "edit"
  } | null>(null)

  const [selectedReservation, setSelectedReservation] = useState<{
    id: number
    mode: "edit" | "history"
  } | null>(null)

  const [reservationStatusDialog, setReservationStatusDialog] = useState<{
    id: number
    reference: string
    currentStatus: string
    nextStatus: "En cours" | "Terminée" | "Annulée"
  } | null>(null)

  const [detail, setDetail] = useState<{ row: string[]; id: number } | null>(
    null,
  )

  const [deleting, setDeleting] = useState<{
    id: number
    label: string
  } | null>(null)

  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [csvError, setCsvError] = useState<string | null>(null)

  const [importingCsv, setImportingCsv] = useState(false)

  const [exportingLostAffairs, setExportingLostAffairs] = useState(false)
  const [reservationExportModalOpen, setReservationExportModalOpen] =
    useState(false)
  const [reservationExportMode, setReservationExportMode] =
    useState<"all" | "range">("all")
  const [reservationExportStartDate, setReservationExportStartDate] =
    useState("")
  const [reservationExportEndDate, setReservationExportEndDate] = useState("")

  const [updatingReservationStatus, setUpdatingReservationStatus] =
    useState(false)

  const csvInput = useRef<HTMLInputElement>(null)

  const clientCsvInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true

    setData(null)

    setError(null)

    fetchTable(module)

      .then((d) => {
        if (alive) setData(d)
      })

      .catch((e: unknown) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Chargement impossible")
      })

    return () => {
      alive = false
    }
  }, [module, refreshKey, localRefreshKey])

  const filtered = useMemo(() => {
    if (!data) return null
    const base = filterTable(data, query)
    if (module !== "Commerciaux" && module !== "Réservations") return base

    const statusColumn = module === "Commerciaux" ? 4 : 11
    const needle = localSearch
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase()
    const rows = base.rows
      .map((row, index) => ({ row, id: base.ids[index]! }))
      .filter(({ row }) => {
        const searchableText = row
          .join(" ")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase()
        return (
          (!needle || searchableText.includes(needle)) &&
          (!statusFilter || row[statusColumn] === statusFilter)
        )
      })

    if (statusSort) {
      const statusOrder =
        module === "Commerciaux"
          ? ["Excellent", "Très bien", "Bien", "À suivre"]
          : ["À venir", "En cours", "Terminée", "Annulée"]
      rows.sort((a, b) => {
        const comparison =
          statusOrder.indexOf(a.row[statusColumn] ?? "") -
          statusOrder.indexOf(b.row[statusColumn] ?? "")
        return statusSort === "asc" ? comparison : -comparison
      })
    }

    return {
      headers: base.headers,
      rows: rows.map(({ row }) => row),
      ids: rows.map(({ id }) => id),
    }
  }, [data, query, localSearch, statusFilter, statusSort, module])

  const managedModule: ManagedModule | null =
    module === "Clients" || module === "Commerciaux" ? module : null

  const pageRows = filtered?.rows.slice(
    (page - 1) * TABLE_PAGE_SIZE,

    page * TABLE_PAGE_SIZE,
  )

  useEffect(() => {
    setPage(1)
  }, [module, query, localSearch, statusFilter, statusSort])

  useEffect(() => {
    setLocalSearch("")
    setStatusFilter("")
    setStatusSort("")
  }, [module])

  useEffect(() => {
    if (
      filtered &&
      page > Math.max(1, Math.ceil(filtered.rows.length / TABLE_PAGE_SIZE))
    )
      setPage(1)
  }, [filtered, page])

  const printFiche = (): void => {
    const id = filtered?.ids[0]

    if (id === undefined) return

    window.open(
      exportUrl(`/api/export/clients/${id}/fiche`),

      "_blank",

      "noopener",
    )
  }

  const remove = async () => {
    if (!deleting || (!managedModule && module !== "Réservations")) return

    setDeleteError(null)

    try {
      const endpoint =
        module === "Réservations"
          ? `/api/reservations/${deleting.id}`
          : `/${
              managedModule === "Clients" ? "api/clients" : "api/commerciaux"
            }/${deleting.id}`
      await apiFetch(endpoint, { method: "DELETE" })

      const label =
        module === "Réservations"
          ? "Réservation"
          : managedModule === "Clients"
            ? "Client"
            : "Commercial"

      setDeleting(null)

      setLocalRefreshKey((current) => current + 1)

      notifyDashboardMutation(`${label} supprimé avec succès.`)
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Suppression impossible")
    }
  }

  const downloadCommercialTemplate = () => {
    downloadCsv("modele-import-commerciaux.csv", [
      commercialCsvHeaders,
      ...commercialCsvExamples,
    ])
  }

  const exportCommercialsCsv = async () => {
    setCsvError(null)

    try {
      const commercials =
        await apiFetch<CommercialFicheDto[]>("/api/commerciaux")

      const rows = commercials.map((commercial) => [
        commercial.prenom ?? "",

        commercial.nomFamille ?? commercial.nom,

        commercial.abreviation ?? "",

        commercial.agence ?? "",

        commercial.codeAgence ?? "",

        commercial.telephone ?? "",

        commercial.email ?? "",
      ])

      downloadCsv("export-commerciaux.csv", [commercialCsvHeaders, ...rows])
    } catch (e: unknown) {
      setCsvError(e instanceof Error ? e.message : "Export CSV impossible")
    }
  }

  const exportClientsCsv = async () => {
    setCsvError(null)
    try {
      const clients =
        await apiFetch<Array<{
          nom: string
          nomFamille?: string
          prenom?: string | null
          type: string
          telephone: string
          email?: string | null
          adresse?: string | null
          numPermis?: string | null
        }>>("/api/clients")
      downloadCsv("export-clients.csv", [
        clientCsvHeaders,
        ...clients.map((client) => [
          client.nomFamille ?? client.nom,
          client.prenom ?? "",
          client.type,
          client.telephone,
          client.email ?? "",
          client.adresse ?? "",
          client.numPermis ?? "",
        ]),
      ])
    } catch (e: unknown) {
      setCsvError(e instanceof Error ? e.message : "Export CSV impossible")
    }
  }

  const importClientsCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    setImportingCsv(true)
    setCsvError(null)
    try {
      const rows = parseCsv(await readCsvFile(file)).slice(1)
      for (const [index, values] of rows.entries()) {
        if (values.length < clientCsvHeaders.length) {
          throw new Error(`Ligne ${index + 2} incomplète.`)
        }
        const type = values[2].trim()
        if (!clientTypes.has(type)) {
          throw new Error(`Type de client invalide à la ligne ${index + 2}.`)
        }
        await apiFetch("/api/clients", {
          method: "POST",
          body: {
            nom: values[0].trim(),
            prenom: values[1].trim(),
            type,
            telephone: values[3].trim(),
            email: values[4].trim(),
            adresse: values[5].trim(),
            numPermis: values[6].trim(),
          },
        })
      }
      setLocalRefreshKey((current) => current + 1)
      notifyDashboardMutation(
        `Import terminé : ${rows.length} client(s) ajouté(s).`,
      )
    } catch (e: unknown) {
      setCsvError(e instanceof Error ? e.message : "Import CSV impossible")
    } finally {
      setImportingCsv(false)
      input.value = ""
    }
  }

  const exportReservationsCsv = async () => {
    setCsvError(null)
    if (
      reservationExportMode === "range" &&
      (!reservationExportStartDate ||
        !reservationExportEndDate ||
        reservationExportStartDate > reservationExportEndDate)
    ) {
      setCsvError("La période sélectionnée est invalide.")
      return
    }
    try {
      const reservations =
        await apiFetch<ReservationFicheDto[]>("/api/reservations")
      const selectedReservations =
        reservationExportMode === "range"
          ? reservations.filter((reservation) => {
              const date = reservation.dateDepart?.slice(0, 10)
              return (
                date &&
                date >= reservationExportStartDate &&
                date <= reservationExportEndDate
              )
            })
          : reservations
      const count = (status: string) =>
        selectedReservations.filter((reservation) => reservation.statut === status)
          .length
      const mobilizedVehicles = new Set(
        selectedReservations
          .filter((reservation) => reservation.statut === "En cours")
          .map((reservation) => reservation.immatriculation)
          .filter(Boolean),
      ).size
      const billingLabels: Record<string, string> = {
        NON_FACTUREE: "",
        EN_ATTENTE_BON_COMMANDE: "En attente de bon de commande",
        FACTURE_EMISE_PAIEMENT_EN_ATTENTE: "Facture émise, paiement en attente",
        PAIEMENT_EFFECTUE: "Paiement effectué",
      }
      const rows = selectedReservations.map((reservation) => [
        reservation.immatriculation,
        reservation.vehicule,
        reservation.commercial ?? "",
        csvDate(reservation.dateReservation),
        csvDate(reservation.dateDepart),
        csvDate(reservation.dateFin),
        reservation.dureeJours,
        reservation.mission ?? "",
        reservation.lieuMission ?? "",
        reservation.client,
        reservation.statutConfirmation ?? "",
        reservation.statut,
        billingLabels[reservation.statutFacturation ?? ""] ??
          reservation.statutFacturation ??
          "",
      ])
      const suffix =
        reservationExportMode === "range"
          ? `-${reservationExportStartDate}-au-${reservationExportEndDate}`
          : ""
      const title =
        reservationExportMode === "range"
          ? `RÉSERVATIONS DU ${reservationExportStartDate.split("-").reverse().join("/")} AU ${reservationExportEndDate.split("-").reverse().join("/")}`
          : "RÉSERVATIONS"
      setReservationExportModalOpen(false)
      downloadCsv(`export-reservations${suffix}.csv`, [
        [title],
        [
          "",
          "Résa à venir:",
          count("À venir"),
          "En cours:",
          count("En cours"),
          "Véh les mobilisés:",
        ],
        [
          "",
          "Terminée:",
          count("Terminée"),
          "Annulée:",
          count("Annulée"),
          mobilizedVehicles,
        ],
        reservationCsvHeaders,
        ...rows,
      ])
    } catch (e: unknown) {
      setCsvError(e instanceof Error ? e.message : "Export CSV impossible")
    }
  }

  const exportLostAffairsCsv = async () => {
    setCsvError(null)
    setExportingLostAffairs(true)
    try {
      const affairs = await apiFetch<Array<{
        agentVente: string | null
        refProforma: string | null
        dateReservation: string | null
        client: string | null
        refBonCommande: string | null
        relance: string | null
        dateAnnulation: string | null
        motifAnnulation: string | null
        vehiculeDemande: string | null
        vehiculePropose: string | null
      }>>("/api/reservations/affaires-perdues")
      const rows = affairs.map((affair, index) => [
        index + 1,
        affair.agentVente ?? "",
        affair.refProforma ?? "",
        csvDate(affair.dateReservation),
        affair.client ?? "",
        affair.refBonCommande ?? "",
        csvDate(affair.relance),
        csvDate(affair.dateAnnulation),
        affair.motifAnnulation ?? "",
        affair.vehiculeDemande ?? "",
        affair.vehiculePropose ?? "",
      ])
      downloadCsv("export-affaires-perdues.csv", [
        ["Aujourd'hui le", "", todayCsvDate()],
        [""],
        ["AFFAIRES PERDUES"],
        [""],
        lostAffairsCsvHeaders,
        ...rows,
      ])
    } catch (e: unknown) {
      setCsvError(e instanceof Error ? e.message : "Export CSV impossible")
    } finally {
      setExportingLostAffairs(false)
    }
  }

  const importReservationsCsv = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const inputElement = event.currentTarget
    const file = inputElement.files?.[0]
    if (!file) return

    setImportingCsv(true)
    setCsvError(null)
    try {
      const result = await apiFetch<{
        created: number
        unresolvedClients?: number
        unresolvedCommercials?: number
      }>("/api/reservations/import-csv", {
        method: "POST",
        body: { csv: await readCsvFile(file) },
      })
      setLocalRefreshKey((current) => current + 1)
      const notices = [
        `Import terminé : ${result.created} réservation(s) ajoutée(s).`,
      ]
      if (result.unresolvedClients) {
        notices.push(
          `${result.unresolvedClients} client(s) importé(s) sans fiche correspondante.`,
        )
      }
      if (result.unresolvedCommercials) {
        notices.push(
          `${result.unresolvedCommercials} agent(s) importé(s) sans fiche correspondante.`,
        )
      }
      notifyDashboardMutation(notices.join(" "))
    } catch (e: unknown) {
      setCsvError(e instanceof Error ? e.message : "Import CSV impossible")
    } finally {
      setImportingCsv(false)
      inputElement.value = ""
    }
  }

  const importCommercialsCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.currentTarget

    const file = inputElement.files?.[0]

    if (!file) return

    setImportingCsv(true)

    setCsvError(null)

    try {
      const result = await apiFetch<{ created: number; updated: number }>(
        "/api/commerciaux/import-csv",
        {
          method: "POST",

          body: { csv: await readCsvFile(file) },
        },
      )

      setLocalRefreshKey((current) => current + 1)

      notifyDashboardMutation(
        `Import terminé : ${result.created} commercial(s) ajouté(s), ${result.updated} mis à jour.`,
      )
    } catch (e: unknown) {
      setCsvError(e instanceof Error ? e.message : "Import CSV impossible")
    } finally {
      setImportingCsv(false)

      inputElement.value = ""
    }
  }

  useEffect(() => {
    if (
      module !== "Réservations" &&
      module !== "Clients" &&
      module !== "Commerciaux"
    ) {
      setPageActions(null)
      return
    }

    if (module === "Commerciaux") {
      setPageActions(
        <div className="page-heading-actions">
          <button
            type="button"
            className="secondary"
            title="Les lignes dont le prénom commence par EXEMPLE sont ignorées à l’import."
            onClick={downloadCommercialTemplate}
          >
            Modèle CSV
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => csvInput.current?.click()}
            disabled={importingCsv}
          >
            {importingCsv ? "Import…" : "Importer CSV"}
          </button>
          <button
            type="button"
            className="primary small"
            onClick={() => void exportCommercialsCsv()}
          >
            Exporter CSV
          </button>
        </div>,
      )
      return () => setPageActions(null)
    }

    if (module === "Clients") {
      setPageActions(
        <div className="page-heading-actions">
          <button
            type="button"
            className="secondary"
            onClick={downloadClientTemplate}
          >
            Modèle CSV
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => clientCsvInput.current?.click()}
            disabled={importingCsv}
          >
            {importingCsv ? "Import…" : "Importer CSV"}
          </button>
          <button
            type="button"
            className="primary small"
            onClick={() => void exportClientsCsv()}
          >
            Exporter CSV
          </button>
        </div>,
      )
      return () => setPageActions(null)
    }

    setPageActions(
      <div className="vehicle-csv-actions reservation-csv-actions">
        <button
          type="button"
          className="secondary vehicle-csv-button"
          title="Les lignes dont le client commence par EXEMPLE sont ignorées à l’import."
          onClick={() =>
            downloadCsv("modele-import-reservations.csv", [
              reservationCsvHeaders,
              ...reservationCsvExamples.map((example) =>
                example.map((value, index) =>
                  index === 3 ? todayCsvDate() : value,
                ),
              ),
            ])
          }
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
          onClick={() => setReservationExportModalOpen(true)}
        >
          Exporter CSV
        </button>
        <button
          type="button"
          className="primary small vehicle-csv-button"
          onClick={() => void exportLostAffairsCsv()}
          disabled={exportingLostAffairs}
        >
          {exportingLostAffairs ? "Exportation…" : "Exporter affaires perdues"}
        </button>
        <input
          ref={csvInput}
          type="file"
          accept=".csv,text/csv"
          aria-label="Sélectionner un fichier CSV de réservations"
          hidden
          onChange={(event) => void importReservationsCsv(event)}
        />
      </div>,
    )
    return () => setPageActions(null)
  }, [module, setPageActions, importingCsv, exportingLostAffairs])

  const updateReservationStatus = async (
    id: number,
    status: "En cours" | "Terminée" | "Annulée",
  ): Promise<boolean> => {
    setCsvError(null)
    setUpdatingReservationStatus(true)
    try {
      await apiFetch(`/api/reservations/${id}/status`, {
        method: "PUT",
        body: { status },
      })
      setLocalRefreshKey((current) => current + 1)
      notifyDashboardMutation(
        `Réservation marquée « ${status.toLowerCase()} ».`,
      )
      return true
    } catch (e: unknown) {
      setCsvError(
        e instanceof Error ? e.message : "Modification du statut impossible",
      )
      return false
    } finally {
      setUpdatingReservationStatus(false)
    }
  }

  if (error) {
    return (
      <section className="data-card">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Chargement impossible :</strong> {error}
        </div>
      </section>
    )
  }

  if (!filtered) {
    return (
      <section className="data-card">
        <p className="p-4 text-sm text-neutral-500">
          Chargement des {module.toLowerCase()}…
        </p>
      </section>
    )
  }

  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div>
          <h2>Gestion des {module.toLowerCase()}</h2>
          <p>{filtered.rows.length} éléments affichés</p>
        </div>
        <div>
          {module === "Commerciaux" && (
            <>
              <input
                ref={csvInput}
                type="file"
                accept=".csv,text/csv"
                aria-label="Sélectionner un fichier CSV de commerciaux"
                hidden
                onChange={(event) => void importCommercialsCsv(event)}
              />
            </>
          )}
          {module === "Clients" && (
            <>
              <input
                ref={clientCsvInput}
                type="file"
                accept=".csv,text/csv"
                aria-label="Sélectionner un fichier CSV de clients"
                hidden
                onChange={(event) => void importClientsCsv(event)}
              />
              {/* <button
                type="button"
                className="secondary"
                onClick={printFiche}
                disabled={filtered.ids.length === 0}
              >
                <Icon name="print" size={17} /> Imprimer une fiche
              </button> */}
            </>
          )}
          <button className="primary small" onClick={onAdd}>
            <Icon name="plus" size={17} /> Ajouter
          </button>
        </div>
      </div>
      {(module === "Commerciaux" || module === "Réservations") && (
        <div className="table-filters" aria-label="Filtres du tableau">
          <input
            className="table-search"
            type="search"
            placeholder={
              module === "Commerciaux"
                ? "Rechercher un commercial…"
                : "Rechercher une réservation…"
            }
            aria-label={`Rechercher dans les ${module.toLowerCase()}`}
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
          />
          <select
            className="secondary status-filter"
            aria-label={
              module === "Commerciaux"
                ? "Filtrer par performance"
                : "Filtrer par statut de réservation"
            }
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">
              {module === "Commerciaux"
                ? "Toutes les performances"
                : "Tous les statuts"}
            </option>
            {(module === "Commerciaux"
              ? ["Excellent", "Très bien", "Bien", "À suivre"]
              : ["À venir", "En cours", "Terminée", "Annulée"]
            ).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            className="secondary status-filter"
            aria-label="Trier par statut"
            value={statusSort}
            onChange={(event) =>
              setStatusSort(event.target.value as "" | "asc" | "desc")
            }
          >
            <option value="">Ordre par défaut</option>
            <option value="asc">Statut croissant</option>
            <option value="desc">Statut décroissant</option>
          </select>
        </div>
      )}
      {csvError && (
        <p className="form-error" role="alert">
          {csvError}
        </p>
      )}
      {module === "Réservations" && reservationExportModalOpen && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(event) => {
              event.preventDefault()
              void exportReservationsCsv()
            }}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setReservationExportModalOpen(false)}
              aria-label="Fermer"
            >
              <Icon name="close" />
            </button>
            <p className="kicker">EXPORT DES RÉSERVATIONS</p>
            <h2>Choisir la période</h2>
            <div className="modal-fields">
              <label>
                <span>Période</span>
                <select
                  value={reservationExportMode}
                  onChange={(event) =>
                    setReservationExportMode(event.target.value as "all" | "range")
                  }
                >
                  <option value="all">Toutes les réservations</option>
                  <option value="range">Entre deux dates de départ</option>
                </select>
              </label>
              {reservationExportMode === "range" && (
                <>
                  <label>
                    <span>Date de début</span>
                    <input
                      type="date"
                      required
                      value={reservationExportStartDate}
                      onChange={(event) =>
                        setReservationExportStartDate(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Date de fin</span>
                    <input
                      type="date"
                      required
                      value={reservationExportEndDate}
                      onChange={(event) =>
                        setReservationExportEndDate(event.target.value)
                      }
                    />
                  </label>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setReservationExportModalOpen(false)}
              >
                Annuler
              </button>
              <button className="primary small">Exporter CSV</button>
            </div>
          </form>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {filtered.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows?.map((row, i) => (
              <tr key={`${row[0]}-${i}`}>
                {row.map((cell, index) => (
                  <td key={`${row[0]}-${index}`}>
                    {index === 0 ? (
                      <strong>{cell}</strong>
                    ) : index ===
                      (module === "Réservations" ? 11 : row.length - 1) ? (
                      <StatusBadge value={cell} />
                    ) : (
                      cell
                    )}
                  </td>
                ))}
                <td className="actions">
                  <button
                    title="Voir les détails"
                    aria-label={`Voir les détails de ${row[0]}`}
                    onClick={() =>
                      setDetail({
                        row,

                        id: filtered.ids[(page - 1) * TABLE_PAGE_SIZE + i]!,
                      })
                    }
                  >
                    <Icon name="eye" size={17} />
                  </button>
                  {module === "Réservations" &&
                    (row[11] === "À venir" || row[11] === "En cours") && (
                      <button
                        type="button"
                        title="Modifier le statut de la réservation"
                        aria-label={`Modifier le statut de la réservation ${row[0]}`}
                        onClick={() => {
                          setCsvError(null)
                          setReservationStatusDialog({
                            id: filtered.ids[(page - 1) * TABLE_PAGE_SIZE + i]!,
                            reference: row[0] ?? "",
                            currentStatus: row[11] ?? "",
                            nextStatus:
                              row[11] === "À venir" ? "En cours" : "Terminée",
                          })
                        }}
                      >
                        <Icon name="refresh" size={17} />
                      </button>
                    )}
                  {managedModule ? (
                    <>
                      <button
                        type="button"
                        title={
                          managedModule === "Clients"
                            ? "Historique client"
                            : "Fiche de performance"
                        }
                        aria-label={
                          managedModule === "Clients"
                            ? "Historique client"
                            : "Fiche de performance"
                        }
                        onClick={() =>
                          setSelectedRecord({
                            id: filtered.ids[(page - 1) * TABLE_PAGE_SIZE + i]!,

                            mode: "details",
                          })
                        }
                      >
                        <Icon name="history" size={17} />
                      </button>
                      <button
                        type="button"
                        title="Modifier"
                        aria-label="Modifier"
                        onClick={() =>
                          setSelectedRecord({
                            id: filtered.ids[(page - 1) * TABLE_PAGE_SIZE + i]!,

                            mode: "edit",
                          })
                        }
                      >
                        <Icon name="edit" size={16} />
                      </button>
                    </>
                  ) : module === "Réservations" ? (
                    <>
                      <button
                        type="button"
                        title="Historique de la réservation"
                        aria-label={`Historique de la réservation ${row[0]}`}
                        onClick={() =>
                          setSelectedReservation({
                            id: filtered.ids[(page - 1) * TABLE_PAGE_SIZE + i]!,
                            mode: "history",
                          })
                        }
                      >
                        <Icon name="history" size={17} />
                      </button>
                      <button
                        type="button"
                        title="Modifier la réservation"
                        aria-label={`Modifier la réservation ${row[0]}`}
                        onClick={() =>
                          setSelectedReservation({
                            id: filtered.ids[(page - 1) * TABLE_PAGE_SIZE + i]!,
                            mode: "edit",
                          })
                        }
                      >
                        <Icon name="edit" size={16} />
                      </button>
                    </>
                  ) : null}
                  <button
                    className="action-delete"
                    title="Supprimer"
                    aria-label={`Supprimer ${row[0]}`}
                    onClick={() => {
                      setDeleteError(null)

                      setDeleting({
                        id: filtered.ids[(page - 1) * TABLE_PAGE_SIZE + i]!,

                        label: row[0] ?? module,
                      })
                    }}
                    hidden={!managedModule && module !== "Réservations"}
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
        total={filtered.rows.length}
        onChange={setPage}
      />
      {detail && (
        <DetailModal
          title={detail.row[0] ?? module}
          subtitle={`${module} · Référence #${detail.id}`}
          fields={filtered.headers.map((header, index) => ({
            label: header,

            value: detail.row[index] ?? "—",
          }))}
          close={() => setDetail(null)}
        />
      )}
      {selectedRecord && managedModule && (
        <ClientCommercialModal
          module={managedModule}
          id={selectedRecord.id}
          mode={selectedRecord.mode}
          close={() => setSelectedRecord(null)}
          onSaved={() => {
            setSelectedRecord(null)

            setLocalRefreshKey((current) => current + 1)
          }}
        />
      )}
      {selectedReservation && (
        <ReservationModal
          id={selectedReservation.id}
          mode={selectedReservation.mode}
          close={() => setSelectedReservation(null)}
          onSaved={() => {
            setSelectedReservation(null)
            setLocalRefreshKey((current) => current + 1)
          }}
        />
      )}
      {reservationStatusDialog && (
        <div
          className="modal-backdrop"
          onClick={() => setReservationStatusDialog(null)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-status-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="kicker">RÉSERVATION</p>
            <h2 id="reservation-status-title">Modifier le statut</h2>
            <p>
              {reservationStatusDialog.reference} · Statut actuel :{" "}
              {reservationStatusDialog.currentStatus}
            </p>
            <label>
              <span>Nouveau statut</span>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={reservationStatusDialog.nextStatus}
                onChange={(event) =>
                  setReservationStatusDialog((current) =>
                    current
                      ? {
                          ...current,
                          nextStatus: event.target
                            .value as "En cours" | "Terminée" | "Annulée",
                        }
                      : current,
                  )
                }
              >
                {reservationStatusDialog.currentStatus === "À venir" ? (
                  <>
                    <option value="En cours">En cours</option>
                    <option value="Annulée">Annulée</option>
                  </>
                ) : (
                  <option value="Terminée">Terminée</option>
                )}
              </select>
            </label>
            {csvError && (
              <p className="form-error" role="alert">
                {csvError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={updatingReservationStatus}
                onClick={() => {
                  setCsvError(null)
                  setReservationStatusDialog(null)
                }}
              >
                Fermer
              </button>
              <button
                type="button"
                className="primary small"
                disabled={updatingReservationStatus}
                onClick={async () => {
                  const dialog = reservationStatusDialog
                  if (
                    await updateReservationStatus(dialog.id, dialog.nextStatus)
                  ) {
                    setReservationStatusDialog(null)
                  }
                }}
              >
                {updatingReservationStatus ? "Mise à jour…" : "Appliquer"}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleting && (managedModule || module === "Réservations") && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setDeleting(null)

            setDeleteError(null)
          }}
        >
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-record-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="kicker">CONFIRMATION</p>
            <h2 id="delete-record-title">
              Supprimer{" "}
              {module === "Réservations"
                ? "cette réservation"
                : managedModule === "Clients"
                  ? "ce client"
                  : "ce commercial"}{" "}
              ?
            </h2>
            <p>
              La suppression de « {deleting.label} » est définitive.
              {module === "Commerciaux" &&
                " Certaines références facultatives à l'historique seront détachées. Elle sera refusée si une location, réservation, affaire perdue ou sortie interne y est encore rattachée."}
            </p>
            {deleteError && <p className="form-error">{deleteError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDeleting(null)

                  setDeleteError(null)
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void remove()}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
