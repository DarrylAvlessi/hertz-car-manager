import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import fs from "node:fs/promises"
import os from "node:os"
import { fileURLToPath } from "node:url"

const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface BilanOptions {
  debut?: string
  fin?: string
  segment?: string
  demo?: boolean
}

async function resolvePython(): Promise<string> {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH
  const candidates = [
    "C:\\Python315\\python.exe",
    "C:\\Python314\\python.exe",
    "python",
    "python3",
  ]
  for (const c of candidates) {
    if (c.includes("\\")) {
      try {
        await fs.access(c)
        return c
      } catch {
        continue
      }
    } else {
      return c
    }
  }
  return "python"
}

export async function generateBilanPdf(
  options: BilanOptions,
  reportData?: object,
): Promise<Buffer> {
  const pythonExec = await resolvePython()
  const scriptPath = path.resolve(__dirname, "generateur_bilan.py")
  const fontsPath = path.resolve(__dirname, "fonts")
  const logoPath = path.resolve(__dirname, "assets/logo.png")

  const tempPdfPath = path.join(
    os.tmpdir(),
    `hertz_bilan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`,
  )
  const tempDataPath = path.join(
    os.tmpdir(),
    `hertz_bilan_data_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`,
  )

  const args: string[] = [
    scriptPath,
    "--output",
    tempPdfPath,
    "--fonts",
    fontsPath,
    "--logo",
    logoPath,
  ]

  try {
    if (options.demo) {
      args.push("--demo")
    } else {
      if (!reportData) {
        throw new Error("Les données du bilan sont requises pour générer un PDF réel.")
      }
      await fs.writeFile(tempDataPath, JSON.stringify(reportData), "utf8")
      args.push("--data-json", tempDataPath)
    }

    const { stdout, stderr } = await execFileAsync(pythonExec, args, {
      timeout: 120000,
      windowsHide: true,
    })
    if (stderr && stderr.trim().length > 0) {
      console.warn("[PDF Bilan Warn]", stderr)
    }
    if (stdout) {
      console.log("[PDF Bilan]", stdout.trim())
    }

    const buffer = await fs.readFile(tempPdfPath)
    return buffer
  } finally {
    await fs.unlink(tempPdfPath).catch(() => {})
    await fs.unlink(tempDataPath).catch(() => {})
  }
}
