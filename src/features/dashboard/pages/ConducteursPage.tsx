import { useEffect, useMemo, useRef, useState } from "react"

import type { ChangeEvent, FormEvent } from "react"

import { useOutletContext } from "react-router-dom"

import DetailModal from "@/shared/components/DetailModal"
import SearchableSelect from "@/shared/components/SearchableSelect"

import Icon from "@/shared/components/Icon"

import { apiFetch } from "@/shared/api/client"

import { notifyDashboardMutation } from "@/shared/components/dashboardNotifications"

import { downloadCsv, parseCsv } from "@/shared/data/csv"

import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"

import type { DashboardOutletContext } from "../DashboardLayout"

type Category = "CLIENT" | "CHAUFFEUR_HERTZ" | "EMPLOYE_HERTZ" | "AUTRE"

interface Driver {
  id: number

  nom: string

  prenom: string | null

  telephone: string | null

  numPermis: string | null

  categorie: Category

  clientId: number | null

  client: string | null
}

interface ClientOption {
  id: number

  nom: string
}

const categoryLabels: Record<Category, string> = {
  CLIENT: "Client",

  CHAUFFEUR_HERTZ: "Chauffeur Hertz",

  EMPLOYE_HERTZ: "Employé Hertz",

  AUTRE: "Autre",
}

const csvHeaders = [
  "Nom",

  "Prénom",

  "Téléphone",

  "N° permis",

  "Catégorie",

  "Client associé",
]

const csvExamples = [
  [
    "ADOKO",
    "Ulrich",
    "+229 97 11 22 33",
    "PERMIS-AB-12345",
    "CLIENT",
    "ARCS BENIN",
  ],

  [
    "HOUNKPE",
    "Deborah",
    "+229 96 44 55 66",
    "PERMIS-AB-67890",
    "CHAUFFEUR_HERTZ",
    "HERTZ BENIN",
  ],
]

export default function ConducteursPage() {
  const { setPageActions } = useOutletContext<DashboardOutletContext>()

  const [rows, setRows] = useState<Driver[]>([])

  const [clients, setClients] = useState<ClientOption[]>([])

  const [editing, setEditing] = useState<Driver | null | undefined>(undefined)

  const [detail, setDetail] = useState<Driver | null>(null)

  const [confirming, setConfirming] = useState<Driver | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  const [importing, setImporting] = useState(false)

  const [query, setQuery] = useState("")

  const [page, setPage] = useState(1)

  const csvInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)

    setError(null)

    try {
      const [drivers, clientRows] = await Promise.all([
        apiFetch<Driver[]>("/api/parc/conducteurs"),

        apiFetch<ClientOption[]>("/api/clients"),
      ])

      setRows(drivers)

      setClients(clientRows)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr")

    return rows.filter((row) =>
      `${row.nom} ${row.prenom ?? ""} ${row.telephone ?? ""} ${row.numPermis ?? ""} ${row.client ?? ""} ${categoryLabels[row.categorie]}`

        .toLocaleLowerCase("fr")

        .includes(needle),
    )
  }, [rows, query])

  const visibleRows = filteredRows.slice(
    (page - 1) * TABLE_PAGE_SIZE,

    page * TABLE_PAGE_SIZE,
  )

  useEffect(() => setPage(1), [query])

  const exportCsv = () => {
    downloadCsv("export-conducteurs.csv", [
      csvHeaders,

      ...rows.map((row) => [
        row.nom,

        row.prenom ?? "",

        row.telephone ?? "",

        row.numPermis ?? "",

        row.categorie,

        row.client ?? "",
      ]),
    ])
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

      const values = parseCsv(await file.text()).slice(1)

      for (const [index, row] of values.entries()) {
        if (row.length < csvHeaders.length) {
          throw new Error(`Ligne ${index + 2} incomplète.`)
        }

        const category = row[4].trim().toUpperCase() as Category

        if (!Object.prototype.hasOwnProperty.call(categoryLabels, category)) {
          throw new Error(`Catégorie invalide à la ligne ${index + 2}.`)
        }

        const clientName = row[5].trim().toLocaleLowerCase("fr")

        const clientId = clientName ? clientIds.get(clientName) : null

        if (clientName && clientId === undefined) {
          throw new Error(`Client associé introuvable à la ligne ${index + 2}.`)
        }

        await apiFetch("/api/parc/conducteurs", {
          method: "POST",

          body: {
            nom: row[0].trim(),

            prenom: row[1].trim() || null,

            telephone: row[2].trim() || null,

            numPermis: row[3].trim() || null,

            categorie: category,

            clientId,
          },
        })
      }

      await load()

      notifyDashboardMutation(
        `Import terminé : ${values.length} conducteur(s) ajouté(s).`,
      )
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Import CSV impossible")
    } finally {
      setImporting(false)

      input.value = ""
    }
  }

  useEffect(() => {
    setPageActions(
      <div className="page-heading-actions">
        <button
          className="secondary"
          type="button"
          onClick={() =>
            downloadCsv("modele-import-conducteurs.csv", [
              csvHeaders,
              ...csvExamples,
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

  const remove = async () => {
    if (!confirming) return

    try {
      await apiFetch(`/api/parc/conducteurs/${confirming.id}`, {
        method: "DELETE",
      })

      setConfirming(null)

      await load()

      notifyDashboardMutation("Conducteur supprimé avec succès.")
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Suppression impossible",
      )
    }
  }

  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div>
          <h2>Conducteurs</h2>
          <p>{filteredRows.length} éléments affichés</p>
        </div>
        <div>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => void importCsv(event)}
          />
          <input
            className="table-search"
            placeholder="Rechercher…"
            aria-label="Rechercher un conducteur"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="primary small"
            type="button"
            onClick={() => setEditing(null)}
          >
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
                <th>Téléphone</th>
                <th>Permis</th>
                <th>Catégorie</th>
                <th>Client associé</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>
                      {row.prenom} {row.nom}
                    </strong>
                  </td>
                  <td>{row.telephone ?? "—"}</td>
                  <td>{row.numPermis ?? "—"}</td>
                  <td>{categoryLabels[row.categorie]}</td>
                  <td>{row.client ?? "—"}</td>
                  <td className="actions">
                    <button
                      type="button"
                      onClick={() => setDetail(row)}
                      title="Voir les détails"
                    >
                      <Icon name="eye" size={17} />
                    </button>
                    <button
                      type="button"
                      className="action-edit"
                      onClick={() => setEditing(row)}
                      title="Modifier"
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      type="button"
                      className="action-delete"
                      onClick={() => setConfirming(row)}
                      title="Supprimer"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={6}>Aucun conducteur trouvé.</td>
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
        <DriverModal
          row={editing}
          clients={clients}
          close={() => setEditing(undefined)}
          saved={load}
        />
      )}
      {detail && (
        <DetailModal
          title={`${detail.prenom ?? ""} ${detail.nom}`}
          fields={[
            { label: "Nom", value: `${detail.prenom ?? ""} ${detail.nom}` },

            { label: "Téléphone", value: detail.telephone ?? "—" },

            { label: "Permis", value: detail.numPermis ?? "—" },

            { label: "Catégorie", value: categoryLabels[detail.categorie] },

            { label: "Client associé", value: detail.client ?? "—" },
          ]}
          close={() => setDetail(null)}
        />
      )}
      {confirming && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="kicker">CONFIRMATION</p>
            <h2>Supprimer ce conducteur ?</h2>
            <p>
              La suppression de « {confirming.prenom} {confirming.nom} » est
              définitive.
            </p>
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setConfirming(null)}
              >
                Annuler
              </button>
              <button
                className="danger"
                type="button"
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

function DriverModal({
  row,
  clients,
  close,
  saved,
}: {
  row: Driver | null
  clients: ClientOption[]
  close: () => void
  saved: () => Promise<void>
}) {
  const [form, setForm] = useState({
    nom: row?.nom ?? "",

    prenom: row?.prenom ?? "",

    telephone: row?.telephone ?? "",

    numPermis: row?.numPermis ?? "",

    categorie: row?.categorie ?? "CLIENT" as Category,

    clientId: row?.clientId ? String(row.clientId) : "",
  })

  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    setError(null)

    try {
      await apiFetch(`/api/parc/conducteurs${row ? `/${row.id}` : ""}`, {
        method: row ? "PUT" : "POST",

        body: {
          ...form,
          clientId: form.clientId ? Number(form.clientId) : null,
          prenom: form.prenom || null,
          telephone: form.telephone || null,
          numPermis: form.numPermis || null,
        },
      })

      close()

      await saved()

      notifyDashboardMutation(
        row
          ? "Conducteur modifié avec succès."
          : "Conducteur enregistré avec succès.",
      )
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Enregistrement impossible",
      )
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
        <p className="kicker">CONDUCTEURS</p>
        <h2>{row ? "Modifier" : "Ajouter"} un conducteur</h2>
        <div className="modal-fields">
          <label>
            <span>Nom</span>
            <input
              value={form.nom}
              onChange={(event) =>
                setForm((current) => ({ ...current, nom: event.target.value }))
              }
              required
              minLength={2}
            />
          </label>
          <label>
            <span>Prénom</span>
            <input
              value={form.prenom}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  prenom: event.target.value,
                }))
              }
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
            />
          </label>
          <label>
            <span>N° permis</span>
            <input
              value={form.numPermis}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  numPermis: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Catégorie</span>
            <select
              value={form.categorie}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  categorie: event.target.value as Category,
                }))
              }
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Client associé</span>
            <SearchableSelect
              value={form.clientId}
              onChange={(value) =>
                setForm((current) => ({ ...current, clientId: value }))
              }
              options={clients.map((client) => ({
                value: String(client.id),
                label: client.nom,
              }))}
              placeholder="Rechercher un client…"
              emptyOptionLabel="Aucun client"
            />
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
