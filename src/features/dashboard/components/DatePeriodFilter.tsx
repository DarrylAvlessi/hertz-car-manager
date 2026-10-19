export type DatePeriod = "all" | "day" | "week" | "month" | "year"

const pad = (value: number) => String(value).padStart(2, "0")
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export function matchesDatePeriod(value: string | null | undefined, period: DatePeriod, now = new Date()): boolean {
  if (period === "all") return true
  if (!value) return false

  const recordDate = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) return false

  let start: Date
  let end: Date
  switch (period) {
    case "day":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      end = start
      break
    case "week": {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const mondayOffset = (today.getDay() + 6) % 7
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset)
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
      break
    }
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      break
    case "year":
      start = new Date(now.getFullYear(), 0, 1)
      end = new Date(now.getFullYear(), 11, 31)
      break
  }
  return recordDate >= dateKey(start) && recordDate <= dateKey(end)
}

export default function DatePeriodFilter({
  value,
  onChange,
}: {
  value: DatePeriod
  onChange: (period: DatePeriod) => void
}) {
  return (
    <select
      className="secondary status-filter"
      aria-label="Filtrer par période"
      value={value}
      onChange={(event) => onChange(event.target.value as DatePeriod)}
    >
      <option value="all">Toutes les périodes</option>
      <option value="day">Journalier</option>
      <option value="week">Hebdomadaire</option>
      <option value="month">Mensuel</option>
      <option value="year">Annuel</option>
    </select>
  )
}
