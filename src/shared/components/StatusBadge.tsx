type StatusKind = "success" | "warning" | "danger"

function getKind(value: string): StatusKind {
  if (
    [
      "Disponible",
      "Excellent",
      "Aboutie",
      "Confirmée",
      "Retourné",
      "En cours",
      "Terminée",
    ].includes(value)
  )
    return "success"
  if (
    [
      "Entretien",
      "En retard",
      "Expirée",
      "Non aboutie",
      "À suivre",
      "Annulée",
    ].includes(value)
  )
    return "danger"
  return "warning"
}

export default function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`status ${getKind(value)}`}>
      <i className="status-dot" aria-hidden="true" />
      {value}
    </span>
  )
}
