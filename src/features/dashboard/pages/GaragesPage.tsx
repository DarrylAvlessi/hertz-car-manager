import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import Icon from "@/shared/components/Icon"
import DetailModal from "@/shared/components/DetailModal"
import { apiFetch } from "@/shared/api/client"
import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"

interface Garage {
  id: number
  nom: string
  adresse: string | null
  telephone: string | null
}

export default function GaragesPage() {
  const [rows, setRows] = useState<Garage[]>([])
  const [editing, setEditing] = useState<Garage | null | undefined>(undefined)
  const [confirming, setConfirming] = useState<Garage | null>(null)
  const [detail, setDetail] = useState<Garage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState("")

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await apiFetch<Garage[]>("/api/parc/garages"))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chargement impossible")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => !needle || `${row.nom} ${row.adresse ?? ""} ${row.telephone ?? ""}`.toLowerCase().includes(needle))
  }, [rows, query])
  const visibleRows = filteredRows.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE)
  useEffect(() => { setPage(1) }, [query])

  const remove = async () => {
    if (!confirming) return
    try {
      await apiFetch<void>(`/api/parc/garages/${confirming.id}`, { method: "DELETE" })
      setConfirming(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Suppression impossible")
      setConfirming(null)
    }
  }

  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div>
          <h2>Garages</h2>
          <p>{filteredRows.length} éléments affichés</p>
        </div>
        <div>
          <input className="table-search" placeholder="Rechercher…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="primary small" onClick={() => setEditing(null)}><Icon name="plus" size={17} /> Ajouter</button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="p-4 text-sm text-neutral-500">Chargement…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Adresse</th>
                <th>Téléphone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.nom}</strong></td>
                  <td>{row.adresse ?? "—"}</td>
                  <td>{row.telephone ?? "—"}</td>
                  <td className="actions">
                    <button onClick={() => setDetail(row)} title="Voir les détails" aria-label={`Voir les détails de ${row.nom}`}>
                      <Icon name="eye" size={17} />
                    </button>
                    <button className="action-edit" onClick={() => setEditing(row)} title="Modifier" aria-label={`Modifier ${row.nom}`}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button className="action-delete" onClick={() => setConfirming(row)} title="Supprimer" aria-label={`Supprimer ${row.nom}`}>
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TablePagination page={page} total={filteredRows.length} onChange={setPage} />
      {editing !== undefined && (
        <GarageModal row={editing} close={() => setEditing(undefined)} saved={load} />
      )}
      {confirming && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="kicker">CONFIRMATION</p>
            <h2>Supprimer ce garage ?</h2>
            <p>La suppression de « {confirming.nom} » est définitive.</p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setConfirming(null)}>Annuler</button>
              <button className="danger" onClick={() => void remove()}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
      {detail && (
        <DetailModal
          title={detail.nom}
          fields={[
            { label: "Nom", value: detail.nom },
            { label: "Adresse", value: detail.adresse ?? "—" },
            { label: "Téléphone", value: detail.telephone ?? "—" },
          ]}
          close={() => setDetail(null)}
        />
      )}
    </section>
  )
}

function GarageModal({
  row,
  close,
  saved,
}: {
  row: Garage | null
  close: () => void
  saved: () => Promise<void>
}) {
  const [form, setForm] = useState({
    nom: row?.nom ?? "",
    adresse: row?.adresse ?? "",
    telephone: row?.telephone ?? "",
  })
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      await apiFetch(`/api/parc/garages${row ? `/${row.id}` : ""}`, {
        method: row ? "PUT" : "POST",
        body: {
          nom: form.nom,
          adresse: form.adresse || null,
          telephone: form.telephone || null,
        },
      })
      close()
      await saved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible")
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <button className="modal-close" type="button" onClick={close} aria-label="Fermer">
          <Icon name="close" />
        </button>
        <p className="kicker">PARC AUTOMOBILE</p>
        <h2>{row ? "Modifier" : "Ajouter"} un garage</h2>
        <div className="modal-fields">
          <label><span>Nom</span><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required maxLength={120} /></label>
          <label><span>Adresse</span><input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} maxLength={255} /></label>
          <label><span>Téléphone</span><input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} maxLength={30} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>Annuler</button>
          <button className="primary small" type="submit">Enregistrer <Icon name="check" size={17} /></button>
        </div>
      </form>
    </div>
  )
}
