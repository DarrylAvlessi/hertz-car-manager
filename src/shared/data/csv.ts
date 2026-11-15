const EXCEL_DATE_VALUE =
  /^(?:\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/

export interface XlsxDownloadOptions {
  headerRow?: number

  dropdowns?: Record<string, readonly string[]>
}

export function csvCell(value: string | number): string {
  const text = String(value)
  const excelSafeText = EXCEL_DATE_VALUE.test(text.trim()) ? `="${text}"` : text

  return /[;",\r\n]/.test(excelSafeText)
    ? `"${excelSafeText.replace(/"/g, '""')}"`
    : excelSafeText
}

export async function downloadXlsx(
  filename: string,
  rows: Array<Array<string | number>>,
  { headerRow = 1, dropdowns = {} }: XlsxDownloadOptions = {},
): Promise<void> {
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet("Données")
  const dropdownWorksheet = workbook.addWorksheet("Dropdowns")
  dropdownWorksheet.state = "hidden"

  rows.forEach((row) => worksheet.addRow(row))

  const headers = rows[headerRow - 1] ?? []
  const lastColumn = headers.length
  const validationEndRow = Math.max(2000, rows.length)

  if (lastColumn > 0) {
    worksheet.getRow(headerRow).font = { bold: true }
    worksheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: lastColumn },
    }
    worksheet.views = [{ state: "frozen", ySplit: headerRow }]
  }

  for (let column = 0; column < headers.length; column += 1) {
    const header = String(headers[column] ?? "")
    const choices = dropdowns[header]
    const excelColumn = column + 1

    if (/^km\b/i.test(header.trim())) {
      for (let row = headerRow + 1; row <= validationEndRow; row += 1) {
        worksheet.getCell(row, excelColumn).numFmt = "0"
      }
    }

    if (/\bdate\b/i.test(header) || /^retour\s+pr[eé]vu$/i.test(header)) {
      for (let row = headerRow + 1; row <= validationEndRow; row += 1) {
        worksheet.getCell(row, excelColumn).numFmt = "dd/mm/yyyy"
      }
    }

    if (!choices?.length) continue

    const dropdownColumn = dropdownWorksheet.getColumn(excelColumn).letter
    choices.forEach((choice, index) => {
      dropdownWorksheet.getCell(index + 1, excelColumn).value = choice
    })
    const dropdownName = `DropdownList${excelColumn}`
    workbook.definedNames.add(
      `Dropdowns!$${dropdownColumn}$1:$${dropdownColumn}$${choices.length}`,
      dropdownName,
    )

    for (let row = headerRow + 1; row <= validationEndRow; row += 1) {
      worksheet.getCell(row, excelColumn).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`=${dropdownName}`],
        showErrorMessage: true,
        errorTitle: "Valeur invalide",
        error: "Sélectionnez une valeur dans la liste.",
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()

  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const ExcelJS = await import("exceljs")
    const workbook = new ExcelJS.Workbook()
    // ExcelJS accepts Uint8Array in browsers, but its declaration requires Node Buffer.
    await workbook.xlsx.load(
      new Uint8Array(buffer) as unknown as Parameters<
        typeof workbook.xlsx.load
      >[0],
    )
    const worksheet = workbook.worksheets[0]
    if (!worksheet) {
      throw new Error("Le fichier Excel ne contient aucune feuille.")
    }

    const rows: string[][] = []
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        const value = cell.value
        values[column - 1] =
          value instanceof Date
            ? `${String(value.getUTCDate()).padStart(2, "0")}/${String(
                value.getUTCMonth() + 1,
              ).padStart(2, "0")}/${value.getUTCFullYear()}`
            : cell.text
      })
      rows.push(values)
    })

    return rows
      .map((row) =>
        row
          .map((value) =>
            /[;",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value,
          )
          .join(";"),
      )
      .join("\r\n")
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder("windows-1252").decode(buffer)
  }
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
      const candidate = value.startsWith("'")
        ? value.slice(1)
        : (formulaDate ?? value)
      return EXCEL_DATE_VALUE.test(candidate.trim()) ? candidate : value
    }),
  )
}
