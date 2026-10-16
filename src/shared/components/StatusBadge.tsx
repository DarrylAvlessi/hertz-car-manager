type StatusKind = "success" | "warning" | "danger"

function getKind(value: string): StatusKind {
  if (
    ["Disponible", "Excellent", "Aboutie", "Confirmée", "Retourné"].includes(
      value,
    )
  )
    return "success"
  if (["Entretien", "Non aboutie", "À suivre"].includes(value)) return "danger"
  return "warning"
}

export default function StatusBadge({ value }: { value: string }) {
  return <span className={`status ${getKind(value)}`}>{value}</span>
}
