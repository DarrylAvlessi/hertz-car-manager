export class CsvParseError extends Error {}

const EXCEL_DATE_VALUE =
  /^(?:\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/

export function parseCsvDate(value: string, endOfDay = false): string | null {
  const text = value
    .normalize("NFKC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim()
  const dateTimeSuffix =
    "(?:[ T]\\d{1,2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:\\s*(?:AM|PM|Z|[+-]\\d{2}:?\\d{2}))?)?"
  const match = text.match(
    new RegExp(
      `^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})${dateTimeSuffix}$`,
      "i",
    ),
  )
  const isoMatch = text.match(
    new RegExp(`^(\\d{4})-(\\d{1,2})-(\\d{1,2})${dateTimeSuffix}$`, "i"),
  )

  if (!match && !isoMatch && /^\d{5,7}(?:\.\d+)?$/.test(text)) {
    const serial = Number(text)
    if (serial >= 20000 && serial < 2958466) {
      const excelDate = new Date(
        Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000,
      )
      const year = excelDate.getUTCFullYear()
      const month = excelDate.getUTCMonth() + 1
      const day = excelDate.getUTCDate()
      const time = endOfDay ? "T23:59:59" : "T00:00:00"
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}${time}`
    }
  }

  const year = match ? Number(match[3]) : isoMatch ? Number(isoMatch[1]) : NaN
  const first = match ? Number(match[1]) : isoMatch ? Number(isoMatch[2]) : NaN
  const second = match ? Number(match[2]) : isoMatch ? Number(isoMatch[3]) : NaN
  const month = isoMatch ? first : second
  const day = isoMatch ? second : first
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  const time = endOfDay ? "T23:59:59" : "T00:00:00"
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}${time}`
}

export function parseCsvDocument(csv: string): string[][] {
  const rows: string[][] = []

  let row: string[] = []

  let field = ""

  let quoted = false

  const firstLine = csv.split(/\r?\n/, 1)[0] ?? ""

  let commaCount = 0

  let semicolonCount = 0

  let inHeaderField = false

  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index]!

    if (character === '"' && firstLine[index + 1] === '"' && inHeaderField) {
      index += 1
    } else if (character === '"') {
      inHeaderField = !inHeaderField
    } else if (!inHeaderField && character === ",") {
      commaCount += 1
    } else if (!inHeaderField && character === ";") {
      semicolonCount += 1
    }
  }

  const delimiter = semicolonCount > commaCount ? ";" : ","

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!

    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"'

        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === delimiter) {
      row.push(field)

      field = ""
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1

      row.push(field)

      rows.push(row)

      row = []

      field = ""
    } else {
      field += character
    }
  }

  if (quoted)
    throw new CsvParseError(
      "Le fichier CSV contient un champ entre guillemets non terminé.",
    )

  if (row.length > 0 || field.length > 0) {
    row.push(field)

    rows.push(row)
  }

  return rows.map((row) =>
    row.map((value) => {
      const formulaDate = /^="(.*)"$/.exec(value)?.[1]
      const candidate = value.startsWith("'")
        ? value.slice(1)
        : (formulaDate ?? value)
      return EXCEL_DATE_VALUE.test(candidate.trim()) ? candidate : value
    }),
  )
}

export function normalizeCsvLookup(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
}

export function normalizeCsvName(value: string): string {
  return normalizeCsvLookup(value)
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .sort()
    .join(" ")
}

export function normalizeCsvHeader(value: string): string {
  return normalizeCsvLookup(value).replace(/[^A-Z0-9]/g, "")
}
