import { useEffect, useMemo, useState } from "react"
import { apiFetch } from "@/shared/api/client"
import DetailModal from "@/shared/components/DetailModal"
import Icon from "@/shared/components/Icon"
import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"
import DatePeriodFilter, { matchesDatePeriod, type DatePeriod } from "../components/DatePeriodFilter"

type MovementType =
  | "ENTREE_PARC" | "MISE_EN_LOCATION" | "RETOUR_LOCATION" | "SORTIE_INTERNE"
  | "RETOUR_INTERNE" | "ENVOI_GARAGE" | "RETOUR_GARAGE" | "SORTIE_DEFINITIVE"
  | "RESERVATION"

interface Movement {
  id: number
  vehiculeId: number
  type: MovementType
  motif: string | null
  kilometrage: number | null
  date: string
  commentaire: string | null
}
interface VehicleOption {
  id: number
  immatriculation: string
}

const movementTypes: MovementType[] = [
  "ENTREE_PARC", "MISE_EN_LOCATION", "RETOUR_LOCATION", "SORTIE_INTERNE",
  "RETOUR_INTERNE", "ENVOI_GARAGE", "RETOUR_GARAGE", "SORTIE_DEFINITIVE", "RESERVATION",
]

export default function MovementsPage() {
  const [rows, setRows] = useState<Movement[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [error, setError] = useState<string | null>(null)
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
  const filteredRows = useMemo(
    () => {
      const needle = query.trim().toLowerCase()
      return rows.filter((row) => (!typeFilter || row.type === typeFilter) &&
        matchesDatePeriod(row.date, datePeriod) &&
        (!needle || `${vehicles.find((vehicle) => vehicle.id === row.vehiculeId)?.immatriculation ?? row.vehiculeId} ${row.type} ${row.motif ?? ""} ${row.commentaire ?? ""}`.toLowerCase().includes(needle)))
    },
      [rows, vehicles, typeFilter, query, datePeriod],
  )
  const visibleRows = useMemo(
    () => filteredRows.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE),
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

  return (
    <section className="data-card">
      <div className="data-toolbar"><div><h2>Mouvements véhicules</h2><p>{filteredRows.length} éléments affichés</p></div><div>
        <input className="table-search" placeholder="Rechercher…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <DatePeriodFilter value={datePeriod} onChange={setDatePeriod} />
        <select className="secondary status-filter" aria-label="Filtrer par type de mouvement" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as MovementType | "")}>
          <option value="">Tous les types</option>
          {movementTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </div></div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-scroll"><table><thead><tr><th>Date</th><th>Véhicule</th><th>Type</th><th>Motif</th><th>Kilométrage</th><th>Observation</th><th>Actions</th></tr></thead><tbody>
        {visibleRows.map((row) => <tr key={row.id}>
          <td>{row.date}</td><td>{vehicles.find((vehicle) => vehicle.id === row.vehiculeId)?.immatriculation ?? `#${row.vehiculeId}`}</td><td>{row.type}</td><td>{row.motif ?? "—"}</td>
          <td>{row.kilometrage === null ? "—" : `${row.kilometrage.toLocaleString("fr-FR")} km`}</td>
          <td>{row.commentaire ?? "—"}</td>
          <td className="actions">
            <button title="Voir les détails" aria-label="Voir les détails" onClick={() => setDetail(row)}><Icon name="eye" size={17} /></button>
            <button className="action-delete" title="Supprimer" aria-label="Supprimer" onClick={() => setDeleting(row)}><Icon name="trash" size={16} /></button>
          </td>
        </tr>)}
      </tbody></table></div>
      <TablePagination page={page} total={filteredRows.length} onChange={setPage} />
      {detail && <DetailModal title={`Mouvement #${detail.id}`} subtitle={vehicles.find((vehicle) => vehicle.id === detail.vehiculeId)?.immatriculation ?? `Véhicule #${detail.vehiculeId}`} fields={[
        { label: "Date", value: detail.date }, { label: "Type", value: detail.type },
        { label: "Motif", value: detail.motif ?? "—" },
        { label: "Kilométrage", value: detail.kilometrage === null ? "—" : `${detail.kilometrage.toLocaleString("fr-FR")} km` },
        { label: "Observation", value: detail.commentaire ?? "—" },
      ]} close={() => setDetail(null)} />}
      {deleting && <div className="modal-backdrop"><div className="modal"><p className="kicker">CONFIRMATION</p><h2>Supprimer ce mouvement ?</h2><p>Cette action est définitive.</p><div className="modal-actions"><button className="secondary" onClick={() => setDeleting(null)}>Annuler</button><button className="danger" onClick={() => void remove()}>Supprimer</button></div></div></div>}
    </section>
  )
}
