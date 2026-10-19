import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { apiFetch } from "@/shared/api/client"
import DetailModal from "@/shared/components/DetailModal"
import Icon from "@/shared/components/Icon"
import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"
import DatePeriodFilter, { matchesDatePeriod, type DatePeriod } from "../components/DatePeriodFilter"

type PassageType = "REPARATION" | "REVISION" | "ENTRETIEN" | "VISITE_TECHNIQUE" | "AUTRE"
type PassageStatus = "EN_ATTENTE" | "EN_COURS" | "TERMINEE"
interface Passage {
  id: number; typePassage: PassageType; dateEntree: string; dateSortiePrevue: string | null
  dateSortieReelle: string | null; kmEntree: number | null; motif: string | null
  statut: PassageStatus; coutTotal: number; vehiculeId: number; garageId: number
  vehicule: string | null; garage: string | null; vehiculeRemplacementId: number | null
}
interface Option { id: number; label: string }

const types: PassageType[] = ["REPARATION", "REVISION", "ENTRETIEN", "VISITE_TECHNIQUE", "AUTRE"]
const statuses: PassageStatus[] = ["EN_ATTENTE", "EN_COURS", "TERMINEE"]

export default function GaragePassagesPage() {
  const [rows, setRows] = useState<Passage[]>([])
  const [garages, setGarages] = useState<Option[]>([])
  const [editing, setEditing] = useState<Passage | null>(null)
  const [detail, setDetail] = useState<Passage | null>(null)
  const [deleting, setDeleting] = useState<Passage | null>(null)
  const [filter, setFilter] = useState<PassageStatus | "">("")
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<PassageType | "">("")
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("all")
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const [passages, garageRows] = await Promise.all([
        apiFetch<Passage[]>("/api/parc/passages-garage"),
        apiFetch<Array<{ id: number; nom: string }>>("/api/parc/garages"),
      ])
      setRows(passages)
      setGarages(garageRows.map((row) => ({ id: row.id, label: row.nom })))
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chargement impossible")
    }
  }
  useEffect(() => { void load() }, [])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => (!filter || row.statut === filter) &&
      (!typeFilter || row.typePassage === typeFilter) &&
      matchesDatePeriod(row.dateEntree, datePeriod) &&
      (!needle || `${row.vehicule ?? ""} ${row.garage ?? ""} ${row.motif ?? ""} ${row.typePassage}`.toLowerCase().includes(needle)))
  }, [rows, filter, typeFilter, query, datePeriod])
  const visible = filtered.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE)
  useEffect(() => { setPage(1) }, [filter, typeFilter, query, datePeriod])
  useEffect(() => { if (page > Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE))) setPage(1) }, [page, filtered.length])

  const remove = async () => {
    if (!deleting) return
    try {
      await apiFetch(`/api/parc/passages-garage/${deleting.id}`, { method: "DELETE" })
      setDeleting(null); await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Suppression impossible"); setDeleting(null)
    }
  }

  return <section className="data-card">
    <div className="data-toolbar"><div><h2>Passages garage</h2><p>{filtered.length} éléments affichés</p></div><div>
      <input className="table-search" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <DatePeriodFilter value={datePeriod} onChange={setDatePeriod} />
      <select className="secondary status-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as PassageType | "")}><option value="">Tous les types</option>{types.map((value) => <option key={value}>{value}</option>)}</select>
      <select className="secondary status-filter" aria-label="Filtrer par statut" value={filter} onChange={(e) => setFilter(e.target.value as PassageStatus | "")}>
        <option value="">Tous les statuts</option>{statuses.map((value) => <option key={value}>{value}</option>)}
      </select>
    </div></div>
    {error && <p className="form-error">{error}</p>}
    <div className="table-scroll"><table><thead><tr><th>Véhicule</th><th>Garage</th><th>Type</th><th>Entrée</th><th>Sortie prévue</th><th>Statut</th><th>Coût total</th><th>Actions</th></tr></thead><tbody>
      {visible.map((row) => <tr key={row.id}><td><strong>{row.vehicule ?? `#${row.vehiculeId}`}</strong></td><td>{row.garage ?? `#${row.garageId}`}</td><td>{row.typePassage}</td><td>{row.dateEntree}</td><td>{row.dateSortiePrevue ?? "—"}</td><td>{row.statut}</td><td>{row.coutTotal.toLocaleString("fr-FR")} FCFA</td><td className="actions">
        <button title="Voir les détails" aria-label="Voir les détails" onClick={() => setDetail(row)}><Icon name="eye" size={17} /></button>
        <button className="action-edit" title="Modifier" aria-label="Modifier" onClick={() => setEditing(row)}><Icon name="edit" size={16} /></button>
        <button className="action-delete" title="Supprimer" aria-label="Supprimer" onClick={() => setDeleting(row)}><Icon name="trash" size={16} /></button>
      </td></tr>)}
    </tbody></table></div>
    <TablePagination page={page} total={filtered.length} onChange={setPage} />
    {editing && <PassageModal passage={editing} garages={garages} close={() => setEditing(null)} saved={load} />}
    {detail && <DetailModal title={`Passage garage #${detail.id}`} subtitle={detail.vehicule ?? undefined} fields={[
      { label: "Garage", value: detail.garage ?? `#${detail.garageId}` }, { label: "Type", value: detail.typePassage },
      { label: "Véhicule de remplacement", value: detail.vehiculeRemplacementId === null ? "—" : `#${detail.vehiculeRemplacementId}` },
      { label: "Date d'entrée", value: detail.dateEntree }, { label: "Sortie prévue", value: detail.dateSortiePrevue ?? "—" },
      { label: "Sortie réelle", value: detail.dateSortieReelle ?? "—" }, { label: "Kilométrage entrée", value: detail.kmEntree === null ? "—" : `${detail.kmEntree} km` },
      { label: "Motif", value: detail.motif ?? "—" }, { label: "Statut", value: detail.statut }, { label: "Coût total", value: `${detail.coutTotal.toLocaleString("fr-FR")} FCFA` },
    ]} close={() => setDetail(null)} />}
    {deleting && <div className="modal-backdrop"><div className="modal"><p className="kicker">CONFIRMATION</p><h2>Supprimer ce passage ?</h2><p>Cette action est définitive.</p><div className="modal-actions"><button className="secondary" onClick={() => setDeleting(null)}>Annuler</button><button className="danger" onClick={() => void remove()}>Supprimer</button></div></div></div>}
  </section>
}

function PassageModal({ passage, garages, close, saved }: { passage: Passage; garages: Option[]; close: () => void; saved: () => Promise<void> }) {
  const [form, setForm] = useState({
    typePassage: passage?.typePassage ?? "REPARATION", dateEntree: passage?.dateEntree ?? new Date().toISOString().slice(0, 10),
    dateSortiePrevue: passage?.dateSortiePrevue ?? "", dateSortieReelle: passage?.dateSortieReelle ?? "",
    kmEntree: passage?.kmEntree == null ? "" : String(passage.kmEntree), motif: passage?.motif ?? "",
    statut: passage?.statut ?? "EN_COURS", coutTotal: String(passage?.coutTotal ?? 0),
    garageId: String(passage?.garageId ?? ""),
  })
  const [error, setError] = useState<string | null>(null)
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null)
    try {
      await apiFetch(`/api/parc/passages-garage/${passage.id}`, { method: "PUT", body: {
        typePassage: form.typePassage, dateEntree: form.dateEntree, dateSortiePrevue: form.dateSortiePrevue || null, dateSortieReelle: form.dateSortieReelle || null,
        kmEntree: form.kmEntree === "" ? null : Number(form.kmEntree), motif: form.motif.trim() || null, statut: form.statut, coutTotal: Number(form.coutTotal) || 0,
        garageId: Number(form.garageId),
      } }); close(); await saved()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Enregistrement impossible") }
  }
  return <div className="modal-backdrop"><form className="modal garage-passage-modal" onSubmit={submit}><button className="modal-close" type="button" onClick={close} aria-label="Fermer"><Icon name="close" /></button><p className="kicker">PARC AUTOMOBILE</p><h2>Modifier un passage garage</h2><div className="modal-fields">
    <label><span>Garage</span><select value={form.garageId} onChange={(e) => set("garageId", e.target.value)} required>{garages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label><span>Type de passage</span><select value={form.typePassage} onChange={(e) => set("typePassage", e.target.value)}>{types.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label><span>Date d'entrée</span><input type="date" value={form.dateEntree} onChange={(e) => set("dateEntree", e.target.value)} required /></label>
    <label><span>Sortie prévue</span><input type="date" value={form.dateSortiePrevue} onChange={(e) => set("dateSortiePrevue", e.target.value)} /></label>
    <label><span>Sortie réelle</span><input type="date" value={form.dateSortieReelle} onChange={(e) => set("dateSortieReelle", e.target.value)} /></label>
    <label><span>Km entrée</span><input type="number" min="0" value={form.kmEntree} onChange={(e) => set("kmEntree", e.target.value)} /></label>
    <label><span>Statut</span><select value={form.statut} onChange={(e) => set("statut", e.target.value)}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label><span>Coût total</span><input type="number" min="0" step="0.01" value={form.coutTotal} onChange={(e) => set("coutTotal", e.target.value)} /></label>
    <label><span>Motif</span><input value={form.motif} maxLength={255} onChange={(e) => set("motif", e.target.value)} /></label>
  </div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={close}>Annuler</button><button className="primary small" type="submit">Enregistrer <Icon name="check" size={17} /></button></div></form></div>
}
