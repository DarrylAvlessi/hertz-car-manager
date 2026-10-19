import { useEffect, useMemo, useState } from "react"

import type { FormEvent } from "react"

import Icon from "@/shared/components/Icon"

import DetailModal from "@/shared/components/DetailModal"

import { apiFetch } from "@/shared/api/client"

import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"

interface Category {
  id: number

  libelle: string

  tarifJournalier: number

  tarifMensuel: number | null
}

interface Model {
  id: number

  marque: string

  nom: string

  nbPlaces: number | null

  categorieId: number | null

  categorie: string | null
}

type Kind = "categories" | "modeles"

function euro(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("fr-FR")} FCFA`
}

export default function ReferenceCrudPage({ kind }: { kind: Kind }) {
  const [categories, setCategories] = useState<Category[]>([])

  const [rows, setRows] = useState<Array<Category | Model>>([])

  const [editing, setEditing] = useState<Category | Model | null | undefined>(
    undefined,
  )

  const [confirming, setConfirming] = useState<Category | Model | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  const [page, setPage] = useState(1)

  const [detail, setDetail] = useState<Category | Model | null>(null)
  const [query, setQuery] = useState("")

  const load = async () => {
    setLoading(true)

    setError(null)

    try {
      const data = await apiFetch<Category[] | Model[]>(`/api/parc/${kind}`)

      setRows(data)

      if (kind === "modeles") {
        setCategories(await apiFetch<Category[]>("/api/parc/categories"))
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chargement impossible")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()

    setPage(1)
  }, [kind])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => !needle || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle)))
  }, [rows, query])
  const visibleRows = filteredRows.slice(
    (page - 1) * TABLE_PAGE_SIZE,
    page * TABLE_PAGE_SIZE,
  )

  useEffect(() => {
    if (page > Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE))) setPage(1)
  }, [page, rows.length])

  const remove = async () => {
    if (!confirming) return

    try {
      await apiFetch<void>(`/api/parc/${kind}/${confirming.id}`, {
        method: "DELETE",
      })

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
          <input className="table-search" placeholder="Rechercher…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} />
          <h2>
            {kind === "categories"
              ? "Catégories véhicules"
              : "Modèles véhicules"}
          </h2>
          <p>{rows.length} éléments affichés</p>
        </div>
        <button className="primary small" onClick={() => setEditing(null)}>
          <Icon name="plus" size={17} /> Ajouter
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="p-4 text-sm text-neutral-500">Chargement…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {kind === "categories" ? (
                  <>
                    <th>Libellé</th>
                    <th>Tarif journalier</th>
                    <th>Tarif mensuel</th>
                  </>
                ) : (
                  <>
                    <th>Marque</th>
                    <th>Modèle</th>
                    <th>Catégorie</th>
                    <th>Places</th>
                  </>
                )}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  {kind === "categories" ? (
                    <>
                      <td>
                        <strong>{(row as Category).libelle}</strong>
                      </td>
                      <td>{euro((row as Category).tarifJournalier)}</td>
                      <td>{euro((row as Category).tarifMensuel)}</td>
                    </>
                  ) : (
                    <>
                      <td>
                        <strong>{(row as Model).marque}</strong>
                      </td>
                      <td>{(row as Model).nom}</td>
                      <td>{(row as Model).categorie ?? "—"}</td>
                      <td>{(row as Model).nbPlaces ?? "—"}</td>
                    </>
                  )}
                  <td className="actions">
                    <button
                      onClick={() => setDetail(row)}
                      title="Voir les détails"
                      aria-label={`Voir les détails de ${
                        kind === "categories"
                          ? (row as Category).libelle
                          : `${(row as Model).marque} ${(row as Model).nom}`
                      }`}
                    >
                      <Icon name="eye" size={17} />
                    </button>
                    <button
                      className="action-edit"
                      onClick={() => setEditing(row)}
                      title="Modifier"
                      aria-label={`Modifier ${
                        kind === "categories"
                          ? (row as Category).libelle
                          : (row as Model).nom
                      }`}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      className="action-delete"
                      onClick={() => setConfirming(row)}
                      title="Supprimer"
                      aria-label={`Supprimer ${
                        kind === "categories"
                          ? (row as Category).libelle
                          : (row as Model).nom
                      }`}
                    >
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
        <ReferenceModal
          kind={kind}
          row={editing}
          categories={categories}
          close={() => setEditing(undefined)}
          saved={load}
        />
      )}
      {confirming && (
        <ConfirmModal
          label={
            kind === "categories"
              ? (confirming as Category).libelle
              : `${(confirming as Model).marque} ${(confirming as Model).nom}`
          }
          close={() => setConfirming(null)}
          confirm={remove}
        />
      )}
      {detail && (
        <DetailModal
          title={
            kind === "categories"
              ? (detail as Category).libelle
              : `${(detail as Model).marque} ${(detail as Model).nom}`
          }
          fields={
            kind === "categories"
              ? [
                  { label: "Libellé", value: (detail as Category).libelle },

                  {
                    label: "Tarif journalier",
                    value: euro((detail as Category).tarifJournalier),
                  },

                  {
                    label: "Tarif mensuel",
                    value: euro((detail as Category).tarifMensuel),
                  },
                ]
              : [
                  { label: "Marque", value: (detail as Model).marque },

                  { label: "Modèle", value: (detail as Model).nom },

                  {
                    label: "Catégorie",
                    value: (detail as Model).categorie ?? "—",
                  },

                  {
                    label: "Nombre de places",
                    value: String((detail as Model).nbPlaces ?? "—"),
                  },
                ]
          }
          close={() => setDetail(null)}
        />
      )}
    </section>
  )
}

function ReferenceModal({
  kind,

  row,

  categories,

  close,

  saved,
}: {
  kind: Kind

  row: Category | Model | null

  categories: Category[]

  close: () => void

  saved: () => Promise<void>
}) {
  const [form, setForm] = useState<Record<string, string>>(
    kind === "categories"
      ? {
          libelle: (row as Category | null)?.libelle ?? "",

          tarifJournalier: String(
            (row as Category | null)?.tarifJournalier ?? "",
          ),

          tarifMensuel: String((row as Category | null)?.tarifMensuel ?? ""),
        }
      : {
          marque: (row as Model | null)?.marque ?? "",

          nom: (row as Model | null)?.nom ?? "",

          nbPlaces: String((row as Model | null)?.nbPlaces ?? ""),

          categorieId: String((row as Model | null)?.categorieId ?? ""),
        },
  )

  const [error, setError] = useState<string | null>(null)

  const set = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    setError(null)

    const body =
      kind === "categories"
        ? {
            libelle: form.libelle,

            tarifJournalier: Number(form.tarifJournalier),

            tarifMensuel: form.tarifMensuel ? Number(form.tarifMensuel) : null,
          }
        : {
            marque: form.marque,

            nom: form.nom,

            nbPlaces: form.nbPlaces ? Number(form.nbPlaces) : null,

            categorieId: form.categorieId ? Number(form.categorieId) : null,
          }

    try {
      await apiFetch(`/api/parc/${kind}${row ? `/${row.id}` : ""}`, {
        method: row ? "PUT" : "POST",

        body,
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
        <button
          className="modal-close"
          type="button"
          onClick={close}
          aria-label="Fermer"
        >
          <Icon name="close" />
        </button>
        <p className="kicker">PARC AUTOMOBILE</p>
        <h2>
          {row ? "Modifier" : "Ajouter"}{" "}
          {kind === "categories" ? "une catégorie" : "un modèle"}
        </h2>
        <div className="modal-fields">
          {kind === "categories" ? (
            <>
              <Field
                label="Libellé"
                value={form.libelle}
                onChange={(v) => set("libelle", v)}
                required
              />
              <Field
                label="Tarif journalier"
                type="number"
                min="0"
                value={form.tarifJournalier}
                onChange={(v) => set("tarifJournalier", v)}
                required
              />
              <Field
                label="Tarif mensuel"
                type="number"
                min="0"
                value={form.tarifMensuel}
                onChange={(v) => set("tarifMensuel", v)}
              />
            </>
          ) : (
            <>
              <Field
                label="Marque"
                value={form.marque}
                onChange={(v) => set("marque", v)}
                required
              />
              <Field
                label="Modèle"
                value={form.nom}
                onChange={(v) => set("nom", v)}
                required
              />
              <Field
                label="Nombre de places"
                type="number"
                min="1"
                max="99"
                value={form.nbPlaces}
                onChange={(v) => set("nbPlaces", v)}
              />
              <label>
                <span>Catégorie</span>
                <select
                  value={form.categorieId}
                  onChange={(e) => set("categorieId", e.target.value)}
                >
                  <option value="">Sans catégorie</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.libelle}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
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

function Field({
  label,
  type = "text",
  min,
  max,
  value,
  onChange,
  required,
}: {
  label: string
  type?: string
  min?: string
  max?: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type={type}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </label>
  )
}

function ConfirmModal({
  label,
  close,
  confirm,
}: {
  label: string
  close: () => void
  confirm: () => Promise<void>
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <p className="kicker">CONFIRMATION</p>
        <h2>Supprimer cet élément ?</h2>
        <p>La suppression de « {label} » est définitive.</p>
        <div className="modal-actions">
          <button className="secondary" onClick={close}>
            Annuler
          </button>
          <button className="danger" onClick={() => void confirm()}>
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}
