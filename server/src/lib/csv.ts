export class CsvParseError extends Error {}

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

  return rows
}

export function normalizeCsvLookup(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
}

export function normalizeCsvHeader(value: string): string {
  return normalizeCsvLookup(value).replace(/[^A-Z0-9]/g, "")
}
