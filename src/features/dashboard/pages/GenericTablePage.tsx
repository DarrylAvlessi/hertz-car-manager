import { useEffect, useMemo, useState } from "react"
import Icon from "@/shared/components/Icon"
import StatusBadge from "@/shared/components/StatusBadge"
import { exportUrl } from "@/shared/api/client"
import { fetchTable, filterTable, type TableResult } from "@/shared/data/dashboardService"
import type { TableModule } from "@/shared/data/types"

export default function GenericTablePage({
  module,
  query,
  onAdd,
}: {
  module: TableModule
  query: string
  onAdd: () => void
}) {
  const [data, setData] = useState<TableResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    fetchTable(module)
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Chargement impossible")
      })
    return () => {
      alive = false
    }
  }, [module])

  const filtered = useMemo(() => (data ? filterTable(data, query) : null), [data, query])

  const printFiche = (): void => {
    const id = filtered?.ids[0]
    if (id === undefined) return
    window.open(exportUrl(`/api/export/clients/${id}/fiche`), "_blank", "noopener")
  }

  if (error) {
    return (
      <section className="data-card">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Chargement impossible :</strong> {error}
        </div>
      </section>
    )
  }

  if (!filtered) {
    return (
      <section className="data-card">
        <p className="p-4 text-sm text-neutral-500">Chargement des {module.toLowerCase()}…</p>
      </section>
    )
  }

  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div>
          <h2>Gestion des {module.toLowerCase()}</h2>
          <p>{filtered.rows.length} éléments affichés</p>
        </div>
        <div>
          {module === "Clients" && (
            <button className="secondary" onClick={printFiche} disabled={filtered.ids.length === 0}>
              <Icon name="print" size={17} /> Imprimer une fiche
            </button>
          )}
          <button className="primary small" onClick={onAdd}>
            <Icon name="plus" size={17} /> Ajouter
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {filtered.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.rows.map((row, i) => (
              <tr key={`${row[0]}-${i}`}>
                {row.map((cell, index) => (
                  <td key={`${row[0]}-${index}`}>
                    {index === 0 ? (
                      <strong>{cell}</strong>
                    ) : index === row.length - 1 ? (
                      <StatusBadge value={cell} />
                    ) : (
                      cell
                    )}
                  </td>
                ))}
                <td className="actions">
                  <button title="Historique">
                    <Icon name="history" size={17} />
                  </button>
                  <button>Modifier</button>
                  <button>•••</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
