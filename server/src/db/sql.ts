export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ""
  let delimiter = ";"
  let quote: "'" | '"' | "`" | null = null
  let blockComment = false

  const lines = sql.split(/\r?\n/)
  for (const line of lines) {
    const delimiterDirective = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line)
    if (!quote && !blockComment && current.trim() === "" && delimiterDirective) {
      delimiter = delimiterDirective[1]
      continue
    }

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      const next = line[i + 1]

      if (blockComment) {
        if (char === "*" && next === "/") {
          blockComment = false
          i += 1
        }
        continue
      }

      if (quote) {
        current += char
        if (char === "\\" && i + 1 < line.length) {
          current += line[i + 1]
          i += 1
        } else if (char === quote) {
          if (next === quote) {
            current += next
            i += 1
          } else {
            quote = null
          }
        }
        continue
      }

      if (char === "/" && next === "*") {
        blockComment = true
        i += 1
        continue
      }
      if (char === "#" || (char === "-" && next === "-")) break
      if (char === "'" || char === '"' || char === "`") {
        quote = char
        current += char
        continue
      }
      if (line.startsWith(delimiter, i)) {
        const statement = current.trim()
        if (statement) statements.push(`${statement};`)
        current = ""
        i += delimiter.length - 1
        continue
      }
      current += char
    }
    current += "\n"
  }

  if (quote || blockComment) throw new Error("SQL incomplet : chaîne ou commentaire non terminé")
  if (current.trim()) throw new Error("SQL incomplet : instruction sans délimiteur final")
  return statements
}
