import Icon from "@/shared/components/Icon"
import StatusBadge from "@/shared/components/StatusBadge"
import { filterRows, getTable } from "@/shared/data/dashboardService"
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
  const table = getTable(module)
  const rows = filterRows(module, query)

  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div>
          <h2>Gestion des {module.toLowerCase()}</h2>
          <p>{rows.length} éléments affichés</p>
        </div>
        <div>
          {module === "Clients" && (
            <button className="secondary">
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
              {table.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
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
