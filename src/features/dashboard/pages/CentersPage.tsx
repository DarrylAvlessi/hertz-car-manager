import { useEffect, useMemo, useRef, useState } from "react"

import type { ChangeEvent, FormEvent } from "react"
import { useOutletContext } from "react-router-dom"

import DetailModal from "@/shared/components/DetailModal"

import Icon from "@/shared/components/Icon"

import { apiFetch } from "@/shared/api/client"

import { notifyDashboardMutation } from "@/shared/components/dashboardNotifications"

import { downloadCsv, parseCsv } from "@/shared/data/csv"

import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"
import type { DashboardOutletContext } from "../DashboardLayout"

type CentreType = "SOCIETE" | "CLIENT" | "PERSONNE" | "AUTRE"

interface Centre {
  id: number

  nom: string

  typeCentre: CentreType

  clientId: number | null

  client: string | null
}

interface ClientOption {
  id: number

  nom: string
}

const centreTypeLabels: Record<CentreType, string> = {
  SOCIETE: "Société",

  CLIENT: "Client",

  PERSONNE: "Personne",

  AUTRE: "Autre",
}

export default function CentersPage() {
  const { setPageActions } = useOutletContext<DashboardOutletContext>()
  const [rows, setRows] = useState<Centre[]>([])

  const [clients, setClients] = useState<ClientOption[]>([])

  const [editing, setEditing] = useState<Centre | null | undefined>(undefined)

  const [confirming, setConfirming] = useState<Centre | null>(null)

  const [detail, setDetail] = useState<Centre | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  const [page, setPage] = useState(1)

  const [query, setQuery] = useState("")

  const [importing, setImporting] = useState(false)

  const csvInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)

    setError(null)

    try {
      const [centreRows, clientRows] = await Promise.all([
        apiFetch<Centre[]>("/api/parc/centres"),

        apiFetch<ClientOption[]>("/api/clients"),
      ])

      setRows(centreRows)

      setClients(clientRows)
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
    const needle = query.trim().toLocaleLowerCase("fr")

    return rows.filter(
      (row) =>
        !needle ||
        `${row.nom} ${centreTypeLabels[row.typeCentre]} ${row.client ?? ""}`

          .toLocaleLowerCase("fr")

          .includes(needle),
    )
  }, [rows, query])

  const visibleRows = filteredRows.slice(
    (page - 1) * TABLE_PAGE_SIZE,
    page * TABLE_PAGE_SIZE,
  )

  useEffect(() => {
    setPage(1)
  }, [query])

  const remove = async () => {
    if (!confirming) return

    try {
      await apiFetch<void>(`/api/parc/centres/${confirming.id}`, {
        method: "DELETE",
      })

      setConfirming(null)

      await load()

      notifyDashboardMutation("Centre supprimé avec succès.")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Suppression impossible")

      setConfirming(null)
    }
  }

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    setImporting(true)
    setError(null)
    try {
      const clientIds = new Map(
        clients.map((client) => [
          client.nom.toLocaleLowerCase("fr"),
          client.id,
        ]),
      )
      const rows = parseCsv(await file.text()).slice(1)
      for (const [index, values] of rows.entries()) {
        if (values.length < 3) throw new Error(`Ligne ${index + 2} incomplète.`)
        const type = values[1].trim().toUpperCase() as CentreType
        if (!Object.prototype.hasOwnProperty.call(centreTypeLabels, type)) {
          throw new Error(`Type de centre invalide à la ligne ${index + 2}.`)
        }
        const clientName = values[2].trim().toLocaleLowerCase("fr")
        const clientId = clientName ? clientIds.get(clientName) : null
        if (clientName && clientId === undefined) {
          throw new Error(`Client associé introuvable à la ligne ${index + 2}.`)
        }
        await apiFetch("/api/parc/centres", {
          method: "POST",
          body: {
            nom: values[0].trim(),
            typeCentre: type,
            clientId,
          },
        })
      }
      await load()
      notifyDashboardMutation(
        `Import terminé : ${rows.length} centre(s) ajouté(s).`,
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import CSV impossible")
    } finally {
      setImporting(false)
      input.value = ""
    }
  }

  const exportCsv = () => {
    downloadCsv("export-centres.csv", [
      ["Nom", "Type", "Client associé"],
      ...rows.map((row) => [row.nom, row.typeCentre, row.client ?? ""]),
    ])
  }

  useEffect(() => {
    setPageActions(
      <div className="page-heading-actions">
        <button
          className="secondary"
          type="button"
          onClick={() =>
            downloadCsv("modele-import-centres.csv", [
              ["Nom", "Type", "Client associé"],
              ["Centre exemple", "SOCIETE", "ARCS BENIN"],
              ["Centre clientèle", "CLIENT", "HERTZ BENIN"],
            ])
          }
        >
          Modèle CSV
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => csvInput.current?.click()}
          disabled={importing}
        >
          {importing ? "Import…" : "Importer CSV"}
        </button>
        <button className="primary small" type="button" onClick={exportCsv}>
          Exporter CSV
        </button>
      </div>,
    )
    return () => setPageActions(null)
  }, [setPageActions, importing, rows])

  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div>
          <h2>Centres</h2>
          <p>{filteredRows.length} éléments affichés</p>
        </div>
        <div>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            aria-label="Sélectionner un fichier CSV de centres"
            hidden
            onChange={(event) => void importCsv(event)}
          />
          <input
            className="table-search"
            placeholder="Rechercher…"
            aria-label="Rechercher un centre"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="primary small" onClick={() => setEditing(null)}>
            <Icon name="plus" size={17} /> Ajouter
          </button>
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
                <th>Type</th>
                <th>Client associé</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.nom}</strong>
                  </td>
                  <td>{centreTypeLabels[row.typeCentre]}</td>
                  <td>{row.client ?? "—"}</td>
                  <td className="actions">
                    <button
                      onClick={() => setDetail(row)}
                      title="Voir les détails"
                      aria-label={`Voir ${row.nom}`}
                    >
                      <Icon name="eye" size={17} />
                    </button>
                    <button
                      className="action-edit"
                      onClick={() => setEditing(row)}
                      title="Modifier"
                      aria-label={`Modifier ${row.nom}`}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      className="action-delete"
                      onClick={() => setConfirming(row)}
                      title="Supprimer"
                      aria-label={`Supprimer ${row.nom}`}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={4}>Aucun centre trouvé.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <TablePagination
        page={page}
        total={filteredRows.length}
        onChange={setPage}
      />
      {editing !== undefined && (
        <CentreModal
          row={editing}
          clients={clients}
          close={() => setEditing(undefined)}
          saved={load}
        />
      )}
      {confirming && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="kicker">CONFIRMATION</p>
            <h2>Supprimer ce centre ?</h2>
            <p>La suppression de « {confirming.nom} » est définitive.</p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setConfirming(null)}>
                Annuler
              </button>
              <button className="danger" onClick={() => void remove()}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
      {detail && (
        <DetailModal
          title={detail.nom}
          fields={[
            { label: "Nom", value: detail.nom },

            { label: "Type", value: centreTypeLabels[detail.typeCentre] },

            { label: "Client associé", value: detail.client ?? "—" },
          ]}
          close={() => setDetail(null)}
        />
      )}
    </section>
  )
}

function CentreModal({
  row,

  clients,

  close,

  saved,
}: {
  row: Centre | null

  clients: ClientOption[]

  close: () => void

  saved: () => Promise<void>
}) {
  const [form, setForm] = useState({
    nom: row?.nom ?? "",

    typeCentre: row?.typeCentre ?? "AUTRE" as CentreType,

    clientId: row?.clientId ? String(row.clientId) : "",
  })

  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    setError(null)

    try {
      await apiFetch(`/api/parc/centres${row ? `/${row.id}` : ""}`, {
        method: row ? "PUT" : "POST",

        body: {
          nom: form.nom,

          typeCentre: form.typeCentre,

          clientId: form.clientId ? Number(form.clientId) : null,
        },
      })

      close()

      await saved()

      notifyDashboardMutation(
        row ? "Centre modifié avec succès." : "Centre enregistré avec succès.",
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible")
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <button
          className="modal-close"
          type="button"
          onClick={close}
          aria-label="Fermer"
        >
          <Icon name="close" />
        </button>
        <p className="kicker">PARC AUTOMOBILE</p>
        <h2>{row ? "Modifier" : "Ajouter"} un centre</h2>
        <div className="modal-fields">
          <label>
            <span>Nom du centre</span>
            <input
              value={form.nom}
              onChange={(event) =>
                setForm((current) => ({ ...current, nom: event.target.value }))
              }
              required
              minLength={2}
              maxLength={120}
            />
          </label>
          <label>
            <span>Type</span>
            <select
              value={form.typeCentre}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  typeCentre: event.target.value as CentreType,
                }))
              }
            >
              {Object.entries(centreTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Client associé (facultatif)</span>
            <select
              value={form.clientId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  clientId: event.target.value,
                }))
              }
            >
              <option value="">Aucun client associé</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nom}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Annuler
          </button>
          <button className="primary small" type="submit">
            Enregistrer <Icon name="check" size={17} />
          </button>
        </div>
      </form>
    </div>
  )
}
