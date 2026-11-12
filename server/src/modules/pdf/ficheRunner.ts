import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import fs from "node:fs/promises"
import os from "node:os"
import { fileURLToPath } from "node:url"

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function resolvePython(): Promise<string> {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH
  for (const candidate of ["C:\\Python315\\python.exe", "C:\\Python314\\python.exe"]) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return "python"
}

export async function generateFichePdf(data: object): Promise<Buffer> {
  const pythonExec = await resolvePython()
  const scriptPath = path.resolve(__dirname, "generateur_fiches.py")
  const fontsPath = path.resolve(__dirname, "fonts")
  const logoPath = path.resolve(__dirname, "assets/logo.png")
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const tempPdfPath = path.join(os.tmpdir(), `hertz_fiche_${suffix}.pdf`)
  const tempDataPath = path.join(os.tmpdir(), `hertz_fiche_data_${suffix}.json`)

  try {
    await fs.writeFile(tempDataPath, JSON.stringify(data), "utf8")
    const { stdout, stderr } = await execFileAsync(
      pythonExec,
      [
        scriptPath,
        "--output",
        tempPdfPath,
        "--fonts",
        fontsPath,
        "--logo",
        logoPath,
        "--data-json",
        tempDataPath,
      ],
      { timeout: 120000, windowsHide: true },
    )
    if (stderr.trim()) console.warn("[PDF Fiche Warn]", stderr)
    if (stdout.trim()) console.log("[PDF Fiche]", stdout.trim())
    return await fs.readFile(tempPdfPath)
  } finally {
    await fs.unlink(tempPdfPath).catch(() => {})
    await fs.unlink(tempDataPath).catch(() => {})
  }
}
