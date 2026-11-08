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

interface Agency {
  id: number

  code: string

  nom: string

  adresse: string | null

  telephone: string | null

  actif: boolean
}

export default function AgenciesPage() {
  const { setPageActions } = useOutletContext<DashboardOutletContext>()
  const [rows, setRows] = useState<Agency[]>([])

  const [editing, setEditing] = useState<Agency | null | undefined>(undefined)

  const [confirming, setConfirming] = useState<Agency | null>(null)

  const [detail, setDetail] = useState<Agency | null>(null)

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
      setRows(await apiFetch<Agency[]>("/api/parc/agences"))
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
        `${row.code} ${row.nom} ${row.adresse ?? ""} ${row.telephone ?? ""}`

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
      await apiFetch<void>(`/api/parc/agences/${confirming.id}`, {
        method: "DELETE",
      })

      setConfirming(null)

      await load()

      notifyDashboardMutation("Agence supprimée avec succès.")
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
      const rows = parseCsv(await file.text()).slice(1)
      for (const [index, values] of rows.entries()) {
        if (values.length < 5) throw new Error(`Ligne ${index + 2} incomplète.`)
        await apiFetch("/api/parc/agences", {
          method: "POST",
          body: {
            code: values[0].trim(),
            nom: values[1].trim(),
            adresse: values[2].trim() || null,
            telephone: values[3].trim() || null,
            actif: !["inactive", "false", "inactif"].includes(
              values[4].trim().toLowerCase(),
            ),
          },
        })
      }
      await load()
      notifyDashboardMutation(
        `Import terminé : ${rows.length} agence(s) ajoutée(s).`,
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import CSV impossible")
    } finally {
      setImporting(false)
      input.value = ""
    }
  }

  const exportCsv = () => {
    downloadCsv("export-agences.csv", [
      ["Code", "Nom", "Adresse", "Téléphone", "Statut"],
      ...rows.map((row) => [
        row.code,
        row.nom,
        row.adresse ?? "",
        row.telephone ?? "",
        row.actif ? "Active" : "Inactive",
      ]),
    ])
  }

  useEffect(() => {
    setPageActions(
      <div className="page-heading-actions">
        <button
          className="secondary"
          type="button"
          onClick={() =>
            downloadCsv("modele-import-agences.csv", [
              ["Code", "Nom", "Adresse", "Téléphone", "Statut"],
              [
                "APS",
                "Agence principale",
                "Cotonou",
                "+229 21 30 00 00",
                "Active",
              ],
              [
                "ABC",
                "Agence aéroport",
                "Aéroport de Cotonou",
                "+229 21 30 11 22",
                "Inactive",
              ],
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
          <h2>Agences</h2>
          <p>{filteredRows.length} éléments affichés</p>
        </div>
        <div>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            aria-label="Sélectionner un fichier CSV d'agences"
            hidden
            onChange={(event) => void importCsv(event)}
          />
          <input
            className="table-search"
            placeholder="Rechercher…"
            aria-label="Rechercher une agence"
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
                <th>Code</th>
                <th>Nom</th>
                <th>Adresse</th>
                <th>Téléphone</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.code}</strong>
                  </td>
                  <td>{row.nom}</td>
                  <td>{row.adresse ?? "—"}</td>
                  <td>{row.telephone ?? "—"}</td>
                  <td>{row.actif ? "Active" : "Inactive"}</td>
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
                  <td colSpan={6}>Aucune agence trouvée.</td>
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
        <AgencyModal
          row={editing}
          close={() => setEditing(undefined)}
          saved={load}
        />
      )}
      {confirming && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="kicker">CONFIRMATION</p>
            <h2>Supprimer cette agence ?</h2>
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
            { label: "Code", value: detail.code },

            { label: "Nom", value: detail.nom },

            { label: "Adresse", value: detail.adresse ?? "—" },

            { label: "Téléphone", value: detail.telephone ?? "—" },

            { label: "Statut", value: detail.actif ? "Active" : "Inactive" },
          ]}
          close={() => setDetail(null)}
        />
      )}
    </section>
  )
}

function AgencyModal({
  row,

  close,

  saved,
}: {
  row: Agency | null

  close: () => void

  saved: () => Promise<void>
}) {
  const [form, setForm] = useState({
    code: row?.code ?? "",

    nom: row?.nom ?? "",

    adresse: row?.adresse ?? "",

    telephone: row?.telephone ?? "",

    actif: row?.actif ?? true,
  })

  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    setError(null)

    try {
      await apiFetch(`/api/parc/agences${row ? `/${row.id}` : ""}`, {
        method: row ? "PUT" : "POST",

        body: {
          ...form,

          code: form.code.trim().toUpperCase(),

          adresse: form.adresse || null,

          telephone: form.telephone || null,
        },
      })

      close()

      await saved()

      notifyDashboardMutation(
        row
          ? "Agence modifiée avec succès."
          : "Agence enregistrée avec succès.",
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
        <h2>{row ? "Modifier" : "Ajouter"} une agence</h2>
        <div className="modal-fields">
          <label>
            <span>Code agence</span>
            <input
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  code: event.target.value.toUpperCase(),
                }))
              }
              required
              minLength={2}
              maxLength={10}
            />
          </label>
          <label>
            <span>Nom</span>
            <input
              value={form.nom}
              onChange={(event) =>
                setForm((current) => ({ ...current, nom: event.target.value }))
              }
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            <span>Adresse</span>
            <input
              value={form.adresse}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  adresse: event.target.value,
                }))
              }
              maxLength={255}
            />
          </label>
          <label>
            <span>Téléphone</span>
            <input
              value={form.telephone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  telephone: event.target.value,
                }))
              }
              maxLength={30}
            />
          </label>
          <label>
            <span>Statut</span>
            <select
              value={form.actif ? "true" : "false"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  actif: event.target.value === "true",
                }))
              }
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
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
