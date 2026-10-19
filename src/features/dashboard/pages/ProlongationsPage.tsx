import { useEffect, useMemo, useState } from "react"
import Icon from "@/shared/components/Icon"
import DetailModal from "@/shared/components/DetailModal"
import { apiFetch } from "@/shared/api/client"

type Row = {
  id: number
  locationId: number
  ancienneDateFin: string | null
  nouvelleDateFin: string
  statut: "EN_COURS" | "EXPIRE"
  dateDemande: string
  motif: string | null
  montantSupplementaire: number
  commercialId: number | null
}
type Option = { id: number; nom?: string; reference?: string }
type Form = {
  locationId: string
  ancienneDateFin: string
  nouvelleDateFin: string
  dateDemande: string
  motif: string
  montantSupplementaire: string
  commercialId: string
}
const formatDate = (value: string | null) => value ? value.replace("T", " ").slice(0, 16) : "—"
const inputDate = (value: string | null) => value ? value.replace(" ", "T").slice(0, 16) : ""
const nowDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)

export default function ProlongationsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [commercials, setCommercials] = useState<Option[]>([])
  const [locations, setLocations] = useState<Option[]>([])
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"" | Row["statut"]>("")
  const [detail, setDetail] = useState<Row | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [deleting, setDeleting] = useState<Row | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const [prolongations, commercialRows, locationRows] = await Promise.all([
        apiFetch<Row[]>("/api/prolongations"),
        apiFetch<Option[]>("/api/commerciaux"),
        apiFetch<Option[]>("/api/locations"),
      ])
      setRows(prolongations)
      setCommercials(commercialRows)
      setLocations(locationRows)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible")
    }
  }
  useEffect(() => { void load() }, [])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      const locationReference = locations.find((item) => item.id === row.locationId)?.reference ?? `Location #${row.locationId}`
      const matchesQuery = !needle || `${locationReference} ${row.motif ?? ""} ${row.dateDemande} ${row.statut}`.toLowerCase().includes(needle)
      return matchesQuery && (!statusFilter || row.statut === statusFilter)
    })
  }, [rows, locations, query, statusFilter])

  const open = (row?: Row) => {
    setEditing(row ?? null)
    setForm(row ? {
      locationId: String(row.locationId),
      ancienneDateFin: inputDate(row.ancienneDateFin),
      nouvelleDateFin: inputDate(row.nouvelleDateFin),
      dateDemande: inputDate(row.dateDemande),
      motif: row.motif ?? "",
      montantSupplementaire: String(row.montantSupplementaire),
      commercialId: row.commercialId ? String(row.commercialId) : "",
    } : {
      locationId: "",
      ancienneDateFin: "",
      nouvelleDateFin: "",
      dateDemande: nowDate(),
      motif: "",
      montantSupplementaire: "0",
      commercialId: "",
    })
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form) return
    try {
      await apiFetch(editing ? `/api/prolongations/${editing.id}` : "/api/prolongations", {
        method: editing ? "PUT" : "POST",
        body: {
          locationId: Number(form.locationId),
          ancienneDateFin: form.ancienneDateFin || null,
          nouvelleDateFin: form.nouvelleDateFin,
          dateDemande: form.dateDemande,
          motif: form.motif || null,
          montantSupplementaire: Number(form.montantSupplementaire),
          commercialId: form.commercialId ? Number(form.commercialId) : null,
        },
      })
      setForm(null)
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible")
    }
  }

  const remove = async () => {
    if (!deleting) return
    try {
      await apiFetch(`/api/prolongations/${deleting.id}`, { method: "DELETE" })
      setDeleting(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible")
    }
  }

  return <section className="data-card">
    <div className="data-toolbar"><div><h2>Gestion des prolongations</h2><p>{filtered.length} éléments affichés</p></div>
      <div><input className="table-search" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="secondary status-filter" aria-label="Filtrer par statut" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}><option value="">Tous les statuts</option><option value="EN_COURS">EN_COURS</option><option value="EXPIRE">EXPIRE</option></select>
        <button className="primary small" onClick={() => open()}><Icon name="plus" size={17} /> Ajouter</button></div></div>
    {error && <p className="form-error">{error}</p>}
    <div className="table-scroll"><table><thead><tr><th>Location</th><th>Ancienne échéance</th><th>Nouvelle échéance</th><th>Statut</th><th>Date demande</th><th>Commercial</th><th>Actions</th></tr></thead>
      <tbody>{filtered.map((row) => <tr key={row.id}><td>{locations.find((item) => item.id === row.locationId)?.reference ?? `Location #${row.locationId}`}</td><td>{formatDate(row.ancienneDateFin)}</td><td>{formatDate(row.nouvelleDateFin)}</td><td>{row.statut}</td><td>{formatDate(row.dateDemande)}</td><td>{commercials.find((item) => item.id === row.commercialId)?.nom ?? "—"}</td>
        <td className="actions"><button title="Voir" onClick={() => setDetail(row)}><Icon name="eye" size={17} /></button>
          <button className="action-edit" title="Modifier" onClick={() => open(row)}><Icon name="edit" size={16} /></button>
          <button className="action-delete" title="Supprimer" onClick={() => setDeleting(row)}><Icon name="trash" size={16} /></button></td></tr>)}</tbody>
    </table></div>
    {form && <div className="modal-backdrop"><form className="modal location-modal" onSubmit={save}>
      <button className="modal-close" type="button" onClick={() => setForm(null)} aria-label="Fermer"><Icon name="close" /></button>
      <p className="kicker">PROLONGATION</p><h2>{editing ? "Modifier la prolongation" : "Ajouter une prolongation"}</h2>
      <div className="modal-fields">
        <label><span>Location</span><select required value={form.locationId} onChange={(event) => setForm({ ...form, locationId: event.target.value })}><option value="">Sélectionner une location</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.reference ?? `Location #${item.id}`}</option>)}</select></label>
        <label><span>Commercial</span><select value={form.commercialId} onChange={(event) => setForm({ ...form, commercialId: event.target.value })}><option value="">Aucun commercial</option>{commercials.map((item) => <option key={item.id} value={item.id}>{item.nom ?? item.id}</option>)}</select></label>
        <label><span>Ancienne date de fin</span><input type="datetime-local" value={form.ancienneDateFin} onChange={(event) => setForm({ ...form, ancienneDateFin: event.target.value })} /></label>
        <label><span>Date de demande</span><input type="datetime-local" required value={form.dateDemande} onChange={(event) => setForm({ ...form, dateDemande: event.target.value })} /></label>
        <label><span>Nouvelle date de fin</span><input type="datetime-local" required value={form.nouvelleDateFin} onChange={(event) => setForm({ ...form, nouvelleDateFin: event.target.value })} /></label>
        <label><span>Montant supplémentaire</span><input type="number" min="0" required value={form.montantSupplementaire} onChange={(event) => setForm({ ...form, montantSupplementaire: event.target.value })} /></label>
        <label><span>Motif</span><input maxLength={255} value={form.motif} onChange={(event) => setForm({ ...form, motif: event.target.value })} /></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setForm(null)}>Annuler</button><button className="primary small">Enregistrer</button></div>
    </form></div>}
    {detail && <DetailModal title={`Prolongation #${detail.id}`} subtitle={`Location #${detail.locationId}`} fields={[
      { label: "Ancienne date de fin", value: formatDate(detail.ancienneDateFin) },
      { label: "Nouvelle date de fin", value: formatDate(detail.nouvelleDateFin) },
      { label: "Statut", value: detail.statut },
      { label: "Date de demande", value: formatDate(detail.dateDemande) },
      { label: "Motif", value: detail.motif ?? "—" },
      { label: "Montant supplémentaire", value: `${detail.montantSupplementaire.toLocaleString("fr-FR")} FCFA` },
      { label: "Commercial", value: commercials.find((item) => item.id === detail.commercialId)?.nom ?? "—" },
    ]} close={() => setDetail(null)} />}
    {deleting && <div className="modal-backdrop"><div className="modal"><h2>Supprimer cette prolongation ?</h2><p>Cette action supprimera la demande #{deleting.id}.</p><div className="modal-actions"><button className="secondary" onClick={() => setDeleting(null)}>Annuler</button><button className="danger" onClick={() => void remove()}>Supprimer</button></div></div></div>}
  </section>
}
