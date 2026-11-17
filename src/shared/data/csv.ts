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

export async function readCsvFile(
  file: File,
  options: { preserveExcelDateDisplay?: boolean } = {},
): Promise<string> {
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
    const formatDate = (date: Date, numberFormat: string) => {
      const format = numberFormat
        .replace(/\[[^\]]+\]/g, "")
        .replace(/"[^"]*"|\\.|_.|\*./g, "")
        .toLowerCase()
      const dateTokens = format.match(/[dmy]+/g) ?? []
      const dayIndex = dateTokens.findIndex((token) => token.startsWith("d"))
      const monthIndex = dateTokens.findIndex((token) => token.startsWith("m"))
      const dayFirst =
        !options.preserveExcelDateDisplay ||
        dayIndex < 0 ||
        monthIndex < 0 ||
        dayIndex < monthIndex
      const first = dayFirst ? date.getUTCDate() : date.getUTCMonth() + 1
      const second = dayFirst ? date.getUTCMonth() + 1 : date.getUTCDate()
      const firstToken = dateTokens.find((token) =>
        token.startsWith(dayFirst ? "d" : "m"),
      )
      const secondToken = dateTokens.find((token) =>
        token.startsWith(dayFirst ? "m" : "d"),
      )
      const formatPart = (value: number, token?: string) =>
        token && token.length > 1
          ? String(value).padStart(2, "0")
          : String(value)

      return `${formatPart(first, firstToken)}/${formatPart(second, secondToken)}/${date.getUTCFullYear()}`
    }
    const formatTime = (date: Date) =>
      `${String(date.getUTCHours()).padStart(2, "0")}:${String(
        date.getUTCMinutes(),
      ).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")}`

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        const format = (cell.numFmt ?? "")
          .replace(/"[^"]*"|\\.|_.|\*./g, "")
          .toLowerCase()
        const hasTimeFormat = /[hs]/.test(format)
        const hasDateFormat = /[dy]/.test(format) || (!hasTimeFormat && /m/.test(format))
        const cellValue = cell.value
        const value =
          cellValue !== null &&
          typeof cellValue === "object" &&
          "result" in cellValue
            ? cellValue.result
            : cellValue
        const isDateValue =
          value instanceof Date ||
          Object.prototype.toString.call(value) === "[object Date]"

        if (isDateValue) {
          const date = value as Date
          values[column - 1] =
            hasTimeFormat && !hasDateFormat
              ? formatTime(date)
              : hasTimeFormat
                ? `${formatDate(date, cell.numFmt ?? "")} ${formatTime(date)}`
                : formatDate(date, cell.numFmt ?? "")
        } else if (
          (typeof value === "number" ||
            (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) &&
          hasDateFormat
        ) {
          values[column - 1] = formatDate(
            new Date(
              Date.UTC(1899, 11, 30) +
                Math.floor(Number(value)) * 86_400_000,
            ),
            cell.numFmt ?? "",
          )
        } else if (
          (typeof value === "number" ||
            (typeof value === "string" && /^(?:0(?:\.\d+)?|0?\.\d+)$/.test(value))) &&
          hasTimeFormat &&
          Number(value) >= 0 &&
          Number(value) < 1
        ) {
          const seconds = Math.min(86_399, Math.round(Number(value) * 86_400))
          values[column - 1] = formatTime(
            new Date(Date.UTC(1899, 11, 30) + seconds * 1_000),
          )
        } else {
          values[column - 1] = cell.text
        }
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
