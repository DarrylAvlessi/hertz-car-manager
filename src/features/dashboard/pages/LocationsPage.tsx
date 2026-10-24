import { useEffect, useMemo, useState } from "react"
import Icon from "@/shared/components/Icon"
import DetailModal from "@/shared/components/DetailModal"
import { apiFetch } from "@/shared/api/client"
import DatePeriodFilter, { matchesDatePeriod, type DatePeriod } from "../components/DatePeriodFilter"

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
  montant: number
  statut: "EN_COURS" | "TERMINEE" | "EN_RETARD" | "EN_PROLONGATION"
}
type ProlongationForm = {
  ancienneDateFin: string
  nouvelleDateFin: string
  dateDemande: string
  motif: string
  montantSupplementaire: string
}
type Option = { id: number; nom?: string; contact?: string; immatriculation?: string }

const empty = {
  reference: "",
  clientId: "",
  vehiculeId: "",
  commercialId: "",
  type: "Courte durée",
  dateDebut: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  dateFin: new Date(Date.now() + 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  dateRetourReelle: "",
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
  const [statusFilter, setStatusFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("all")
  const [prolongation, setProlongation] = useState<ProlongationForm | null>(null)
  const [prolongationConfirmed, setProlongationConfirmed] = useState(false)

  const load = async () => {
    try {
      const [locations, clientRows, commercialRows, vehicleRows] = await Promise.all([
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
    return rows.filter((row) =>
      (!needle || `${row.reference} ${row.clientId} ${row.vehiculeId} ${row.type} ${row.statut}`.toLowerCase().includes(needle)) &&
      (!statusFilter || effectiveStatus(row) === statusFilter) && (!typeFilter || row.type === typeFilter) &&
      matchesDatePeriod(row.dateDebut, datePeriod),
    )
  }, [rows, query, statusFilter, typeFilter, datePeriod])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form) return
    if (prolongation && !prolongationConfirmed) {
      setError("Validez les informations de prolongation avant d’enregistrer la location.")
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
        ...(prolongation && prolongationConfirmed && {
          prolongation: {
            ...prolongation,
            montantSupplementaire: Number(prolongation.montantSupplementaire),
            commercialId: form.commercialId ? Number(form.commercialId) : null,
          },
        }),
      }
      await apiFetch(editing ? `/api/locations/${editing.id}` : "/api/locations", {
        method: editing ? "PUT" : "POST",
        body,
      })
      setForm(null)
      setEditing(null)
      setProlongation(null)
      setProlongationConfirmed(false)
      await load()
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
    setForm(location ? {
      reference: location.reference,
      clientId: String(location.clientId),
      vehiculeId: String(location.vehiculeId),
      commercialId: location.commercialId ? String(location.commercialId) : "",
      type: location.type,
      dateDebut: location.dateDebut,
      dateFin: location.dateFin,
      dateRetourReelle: location.dateRetourReelle?.replace(" ", "T").slice(0, 16) ?? "",
      montant: String(location.montant),
      statut: location.statut,
    } : { ...empty })
    setProlongation(null)
    setProlongationConfirmed(false)
  }

  return <section className="data-card">
    <div className="data-toolbar"><div><h2>Gestion des locations</h2><p>{filteredRows.length} éléments affichés</p></div>
      <div><input className="table-search" placeholder="Rechercher…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <DatePeriodFilter value={datePeriod} onChange={setDatePeriod} />
        <select className="secondary status-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Tous les types</option><option>Courte durée</option><option>Longue durée</option></select>
        <select className="secondary status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tous les statuts</option><option>En cours</option><option>À retourner</option><option>En prolongation</option><option>Retourné</option><option>Annulé</option></select>
        <button className="primary small" onClick={() => open()}><Icon name="plus" size={17} /> Ajouter</button></div></div>
    {error && <p className="form-error">{error}</p>}
    <div className="table-scroll"><table><thead><tr><th>Contrat</th><th>Client</th><th>Véhicule</th><th>Type</th><th>Échéance</th><th>État</th><th>Actions</th></tr></thead>
      <tbody>{filteredRows.map((row) => <tr key={row.id}><td><strong>{row.reference}</strong></td>
        <td>{clients.find((item) => item.id === row.clientId)?.nom ?? row.clientId}</td>
        <td>{vehicles.find((item) => item.id === row.vehiculeId)?.immatriculation ?? row.vehiculeId}</td>
        <td>{row.type}</td><td>{displayDateTime(row.dateFin)}</td><td>{effectiveStatus(row)}</td>
        <td className="actions"><button title="Voir" onClick={() => setDetail(row)}><Icon name="eye" size={17} /></button>
          <button className="action-edit" title="Modifier" onClick={() => open(row)}><Icon name="edit" size={16} /></button>
          <button className="action-delete" title="Supprimer" onClick={() => setDeleting(row)}><Icon name="trash" size={16} /></button></td>
      </tr>)}</tbody></table></div>
    {form && <div className="modal-backdrop"><form className="modal location-modal" onSubmit={save}><button className="modal-close" type="button" onClick={() => setForm(null)}><Icon name="close" /></button>
      <p className="kicker">LOCATION</p><h2>{editing ? "Modifier la location" : "Ajouter une location"}</h2><div className="modal-fields">
        <label><span>Référence</span><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
        <label><span>Client</span><select required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}><option value="">Sélectionner</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.nom ?? item.id}</option>)}</select></label>
        <label><span>Véhicule</span><select required value={form.vehiculeId} onChange={(e) => setForm({ ...form, vehiculeId: e.target.value })}><option value="">Sélectionner</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.immatriculation ?? item.id}</option>)}</select></label>
        <label><span>Commercial</span><select required value={form.commercialId} onChange={(e) => setForm({ ...form, commercialId: e.target.value })}><option value="">Sélectionner un commercial</option>{commercials.map((item) => <option key={item.id} value={item.id}>{item.nom ?? item.id}</option>)}</select></label>
        <label><span>Type</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}><option>Courte durée</option><option>Longue durée</option></select></label>
        <label><span>Date et heure de début</span><input type="datetime-local" required value={form.dateDebut.replace(" ", "T").slice(0, 16)} onChange={(e) => setForm({ ...form, dateDebut: e.target.value })} /></label>
        <label><span>Date et heure de fin</span><input type="datetime-local" required value={form.dateFin.replace(" ", "T").slice(0, 16)} onChange={(e) => setForm({ ...form, dateFin: e.target.value })} /></label>
        {editing && <label><span>Date et heure du retour réel</span><input type="datetime-local" value={form.dateRetourReelle} readOnly /></label>}
        <label><span>Montant</span><input type="number" min="0" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} /></label>
        <label><span>Statut</span><select value={form.statut} onChange={(e) => {
          const statut = e.target.value as typeof form.statut
          const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
          setForm({
            ...form,
            statut,
            dateRetourReelle: statut === "TERMINEE" ? form.dateRetourReelle || now : "",
          })
          setProlongationConfirmed(false)
          if (statut === "EN_PROLONGATION" && editing) {
            setProlongation({
              ancienneDateFin: editing.dateFin.replace(" ", "T").slice(0, 16),
              nouvelleDateFin: "",
              dateDemande: now,
              motif: "",
              montantSupplementaire: "",
            })
          } else {
            setProlongation(null)
          }
        }}><option value="EN_COURS">EN_COURS</option><option value="TERMINEE">TERMINEE</option><option value="EN_RETARD">EN_RETARD</option><option value="EN_PROLONGATION">EN_PROLONGATION</option></select></label>
      </div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setForm(null)}>Annuler</button><button className="primary small">Enregistrer</button></div>
    </form></div>}
    {prolongation && form && !prolongationConfirmed && <div className="modal-backdrop"><div className="modal location-modal">
      <button className="modal-close" type="button" onClick={() => {
        setProlongation(null)
        setProlongationConfirmed(false)
        setForm((current) => current ? { ...current, statut: editing?.statut ?? "EN_COURS" } : current)
      }}><Icon name="close" /></button>
      <p className="kicker">PROLONGATION</p><h2>Informations de prolongation</h2>
      <div className="modal-fields">
        <label><span>Ancienne date de fin</span><input type="datetime-local" value={prolongation.ancienneDateFin} readOnly /></label>
        <label><span>Date de demande</span><input type="datetime-local" value={prolongation.dateDemande} readOnly /></label>
        <label><span>Nouvelle date de fin</span><input type="datetime-local" required value={prolongation.nouvelleDateFin} onChange={(e) => setProlongation({ ...prolongation, nouvelleDateFin: e.target.value })} /></label>
        <label><span>Motif</span><textarea required value={prolongation.motif} onChange={(e) => setProlongation({ ...prolongation, motif: e.target.value })} /></label>
        <label><span>Montant supplémentaire</span><input type="number" min="0" required value={prolongation.montantSupplementaire} onChange={(e) => setProlongation({ ...prolongation, montantSupplementaire: e.target.value })} /></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => {
        setProlongation(null)
        setProlongationConfirmed(false)
        setForm((current) => current ? { ...current, statut: editing?.statut ?? "EN_COURS" } : current)
      }}>Annuler</button><button type="button" className="primary small" disabled={!prolongation.nouvelleDateFin || !prolongation.motif.trim() || !prolongation.montantSupplementaire} onClick={() => {
        setForm((current) => current ? { ...current, dateFin: prolongation.nouvelleDateFin } : current)
        setProlongationConfirmed(true)
      }}>Valider</button></div>
    </div></div>}
    {detail && <DetailModal
      title={detail.reference}
      subtitle="Location"
      fields={[
        { label: "Référence", value: detail.reference },
        {
          label: "Client",
          value: clients.find((item) => item.id === detail.clientId)?.nom ?? "Client introuvable",
        },
        {
          label: "Véhicule",
          value: vehicles.find((item) => item.id === detail.vehiculeId)?.immatriculation ?? "Véhicule introuvable",
        },
        {
          label: "Commercial",
          value: detail.commercialId
            ? commercials.find((item) => item.id === detail.commercialId)?.nom ?? "Commercial introuvable"
            : "—",
        },
        { label: "Type", value: detail.type },
        { label: "Date et heure de début", value: displayDateTime(detail.dateDebut) },
        { label: "Date et heure de fin", value: displayDateTime(detail.dateFin) },
        { label: "Date et heure du retour réel", value: detail.dateRetourReelle ? displayDateTime(detail.dateRetourReelle) : "—" },
        { label: "Montant", value: `${detail.montant.toLocaleString("fr-FR")} FCFA` },
        { label: "Statut", value: effectiveStatus(detail) },
      ]}
      close={() => setDetail(null)}
    />}
    {deleting && <div className="modal-backdrop"><div className="modal"><h2>Supprimer cette location ?</h2><div className="modal-actions"><button className="secondary" onClick={() => setDeleting(null)}>Annuler</button><button className="danger" onClick={() => void remove()}>Supprimer</button></div></div></div>}
  </section>
}
