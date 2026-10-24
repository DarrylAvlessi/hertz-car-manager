import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { apiFetch } from "@/shared/api/client"
import DetailModal from "@/shared/components/DetailModal"
import Icon from "@/shared/components/Icon"
import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"
import DatePeriodFilter, { matchesDatePeriod, type DatePeriod } from "../components/DatePeriodFilter"

interface Repair {
  id: number
  description: string
  dateReparation: string
  cout: number
  passageId: number
  vehicule: string | null
}

export default function RepairsPage() {
  const [rows, setRows] = useState<Repair[]>([])
  const [editing, setEditing] = useState<Repair | null>(null)
  const [detail, setDetail] = useState<Repair | null>(null)
  const [deleting, setDeleting] = useState<Repair | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("all")

  const load = async () => {
    try {
      setRows(await apiFetch<Repair[]>("/api/parc/reparations"))
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chargement impossible")
    }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { setPage(1) }, [query, datePeriod])
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => matchesDatePeriod(row.dateReparation, datePeriod) &&
      (!needle || `${row.vehicule ?? ""} ${row.description} ${row.dateReparation}`.toLowerCase().includes(needle)))
  }, [rows, query, datePeriod])

  const remove = async () => {
    if (!deleting) return
    try {
      await apiFetch(`/api/parc/reparations/${deleting.id}`, { method: "DELETE" })
      setDeleting(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Suppression impossible")
      setDeleting(null)
    }
  }

  const visible = rows.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE)
  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div><h2>Réparations</h2><p>{filteredRows.length} éléments affichés</p></div>
        <input className="table-search" placeholder="Rechercher…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <DatePeriodFilter value={datePeriod} onChange={setDatePeriod} />
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-scroll">
        <table>
          <thead><tr><th>Véhicule</th><th>Description</th><th>Date de réparation</th><th>Coût</th><th>Actions</th></tr></thead>
          <tbody>
            {filteredRows.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE).map((row) => (
              <tr key={row.id}>
                <td><strong>{row.vehicule ?? "—"}</strong></td>
                <td>{row.description}</td>
                <td>{row.dateReparation}</td>
                <td>{row.cout.toLocaleString("fr-FR")} FCFA</td>
                <td className="actions">
                  <button title="Voir les détails" aria-label="Voir les détails" onClick={() => setDetail(row)}>
                    <Icon name="eye" size={17} />
                  </button>
                  <button className="action-edit" title="Modifier" aria-label="Modifier" onClick={() => setEditing(row)}>
                    <Icon name="edit" size={16} />
                  </button>
                  <button className="action-delete" title="Supprimer" aria-label="Supprimer" onClick={() => setDeleting(row)}>
                    <Icon name="trash" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination page={page} total={filteredRows.length} onChange={setPage} />
      {editing && <RepairModal repair={editing} close={() => setEditing(null)} saved={load} />}
      {detail && <DetailModal
        title={`Réparation #${detail.id}`}
        subtitle={detail.vehicule ?? undefined}
        fields={[
          { label: "Description", value: detail.description },
          { label: "Date de réparation", value: detail.dateReparation },
          { label: "Coût", value: `${detail.cout.toLocaleString("fr-FR")} FCFA` },
          { label: "Passage garage", value: `#${detail.passageId}` },
        ]}
        close={() => setDetail(null)}
      />}
      {deleting && <div className="modal-backdrop"><div className="modal">
        <p className="kicker">CONFIRMATION</p><h2>Supprimer cette réparation ?</h2>
        <p>Cette action est définitive.</p>
        <div className="modal-actions">
          <button className="secondary" onClick={() => setDeleting(null)}>Annuler</button>
          <button className="danger" onClick={() => void remove()}>Supprimer</button>
        </div>
      </div></div>}
    </section>
  )
}

function RepairModal({ repair, close, saved }: { repair: Repair; close: () => void; saved: () => Promise<void> }) {
  const [description, setDescription] = useState(repair.description)
  const [cout, setCout] = useState(String(repair.cout))
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      await apiFetch(`/api/parc/reparations/${repair.id}`, {
        method: "PUT",
        body: { description: description.trim(), cout: Number(cout) },
      })
      close()
      await saved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Modification impossible")
    }
  }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}>
    <button className="modal-close" type="button" onClick={close} aria-label="Fermer"><Icon name="close" /></button>
    <p className="kicker">PARC AUTOMOBILE</p><h2>Modifier la réparation</h2>
    <div className="modal-fields">
      <label><span>Description</span><input value={description} maxLength={255} required onChange={(e) => setDescription(e.target.value)} /></label>
      <label><span>Coût</span><input type="number" min="0" step="0.01" value={cout} required onChange={(e) => setCout(e.target.value)} /></label>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Annuler</button><button className="primary small" type="submit">Enregistrer <Icon name="check" size={17} /></button></div>
  </form></div>
}
