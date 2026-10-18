import { useEffect, useMemo, useState } from "react"

import Icon from "@/shared/components/Icon"

import StatusBadge from "@/shared/components/StatusBadge"

import {
  fetchTable,
  filterTable,
  type TableResult,
} from "@/shared/data/dashboardService"

import type { TableModule } from "@/shared/data/types"

import ClientCommercialModal from "../components/ClientCommercialModal"

type ManagedModule = "Clients" | "Commerciaux"

export default function GenericTablePage({
  module,

  query,

  refreshKey,

  onAdd,
}: {
  module: TableModule

  query: string

  refreshKey: number

  onAdd: () => void
}) {
  const [data, setData] = useState<TableResult | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [localRefreshKey, setLocalRefreshKey] = useState(0)

  const [selectedRecord, setSelectedRecord] = useState<{
    id: number

    mode: "details" | "edit"
  } | null>(null)

  useEffect(() => {
    let alive = true

    setData(null)

    setError(null)

    fetchTable(module)

      .then((d) => {
        if (alive) setData(d)
      })

      .catch((e: unknown) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Chargement impossible")
      })

    return () => {
      alive = false
    }
  }, [module, refreshKey, localRefreshKey])

  const filtered = useMemo(
    () => (data ? filterTable(data, query) : null),
    [data, query],
  )

  const managedModule: ManagedModule | null =
    module === "Clients" || module === "Commerciaux" ? module : null

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
        <p className="p-4 text-sm text-neutral-500">
          Chargement des {module.toLowerCase()}…
        </p>
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
                  {managedModule ? (
                    <>
                      <button
                        type="button"
                        title={
                          managedModule === "Clients"
                            ? "Historique client"
                            : "Fiche de performance"
                        }
                        aria-label={
                          managedModule === "Clients"
                            ? "Historique client"
                            : "Fiche de performance"
                        }
                        onClick={() =>
                          setSelectedRecord({
                            id: filtered.ids[i]!,
                            mode: "details",
                          })
                        }
                      >
                        <Icon
                          name={
                            managedModule === "Clients" ? "history" : "stats"
                          }
                          size={17}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedRecord({
                            id: filtered.ids[i]!,
                            mode: "edit",
                          })
                        }
                      >
                        Modifier
                      </button>
                    </>
                  ) : (
                    <>
                      <button title="Historique">
                        <Icon name="history" size={17} />
                      </button>
                      <button>Modifier</button>
                      <button>•••</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedRecord && managedModule && (
        <ClientCommercialModal
          module={managedModule}
          id={selectedRecord.id}
          mode={selectedRecord.mode}
          close={() => setSelectedRecord(null)}
          onSaved={() => {
            setSelectedRecord(null)

            setLocalRefreshKey((current) => current + 1)
          }}
        />
      )}
    </section>
  )
}
