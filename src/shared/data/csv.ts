const EXCEL_DATE_VALUE =
  /^(?:\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/

export function csvCell(value: string | number): string {
  const text = String(value)
  const excelSafeText = EXCEL_DATE_VALUE.test(text.trim())
    ? `="${text}"`
    : text

  return /[;",\r\n]/.test(excelSafeText)
    ? `"${excelSafeText.replace(/"/g, '""')}"`
    : excelSafeText
}

export function downloadCsv(
  filename: string,
  rows: Array<Array<string | number>>,
): void {
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n")

  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })

  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")

  link.href = url

  link.download = filename

  document.body.append(link)

  link.click()

  link.remove()

  URL.revokeObjectURL(url)
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]

    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ";" && !quoted) {
      row.push(cell)
      cell = ""
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1
      row.push(cell)
      if (row.some((value) => value.trim() !== "")) rows.push(row)
      row = []
      cell = ""
    } else {
      cell += character
    }
  }

  if (cell || row.length > 0) {
    row.push(cell)
    if (row.some((value) => value.trim() !== "")) rows.push(row)
  }

  return rows.map((row) =>
    row.map((value) => {
      const formulaDate = /^="(.*)"$/.exec(value)?.[1]
      const candidate = value.startsWith("'") ? value.slice(1) : formulaDate ?? value
      return EXCEL_DATE_VALUE.test(candidate.trim()) ? candidate : value
    }),
  )
}
