import type PDFDocument from "pdfkit"
import type {
  ClientFiche,
  LocationFiche,
  MonthlyPoint,
  OverviewStats,
} from "../../repositories/types.js"

const JAUNE = "#FFCC00"
const NOIR = "#222222"
const GRIS = "#6b7280"
const VERT = "#2D6A4F"
const BLEU = "#4A90E2"
const ROUGE = "#D00000"

type Doc = InstanceType<typeof PDFDocument>

export function formatMontant(n: number): string {
  return `${n.toLocaleString("fr-FR").replace(/,/g, " ")} FCFA`
}

function header(doc: Doc, titre: string, sousTitre: string): void {
  doc.rect(0, 0, doc.page.width, 70).fill(JAUNE)
  doc.fillColor(NOIR).fontSize(20).font("Helvetica-Bold").text(titre, 50, 22)
  doc.fillColor(NOIR).fontSize(10).font("Helvetica").text(sousTitre, 50, 48)
  doc.moveDown(3)
}

function kpiLine(doc: Doc, label: string, value: string): void {
  doc
    .fillColor(GRIS)
    .fontSize(9)
    .font("Helvetica")
    .text(label, { continued: true })
  doc.fillColor(NOIR).font("Helvetica-Bold").text(`  ${value}`)
  doc.moveDown(0.3)
}

function sectionTitle(doc: Doc, title: string): void {
  doc.fillColor(NOIR).fontSize(12).font("Helvetica-Bold").text(title)
  doc.moveDown(0.4)
}

function drawBarChart(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  height: number,
  data: { label: string; values: { label: string; value: number }[] }[],
  colors: string[],
): void {
  const barWidth = width / data.length / 2
  const maxVal = Math.max(
    ...data.flatMap((d) => d.values.map((v) => v.value)),
    1,
  )
  const baseY = y + height

  // Axis
  doc.strokeColor(GRIS).lineWidth(0.5)
  doc
    .moveTo(x, baseY)
    .lineTo(x + width, baseY)
    .stroke()
  doc.moveTo(x, y).lineTo(x, baseY).stroke()

  data.forEach((d, i) => {
    const cx = x + i * barWidth * 2 + barWidth
    d.values.forEach((v, j) => {
      const barHeight = (v.value / maxVal) * height
      const bx = cx + j * barWidth
      doc
        .fillColor(colors[j])
        .rect(bx, baseY - barHeight, barWidth - 4, barHeight)
        .fill()
      doc
        .fillColor(NOIR)
        .fontSize(7)
        .text(String(v.value), bx, baseY - barHeight - 12, {
          width: barWidth,
          align: "center",
        })
    })
    doc
      .fillColor(NOIR)
      .fontSize(7)
      .text(d.label, cx - barWidth, baseY + 4, {
        width: barWidth * 2,
        align: "center",
      })
  })

  // Legend
  let lx = x
  data[0].values.forEach((v, j) => {
    doc
      .fillColor(colors[j])
      .rect(lx, baseY + 18, 10, 10)
      .fill()
    doc
      .fillColor(NOIR)
      .fontSize(8)
      .text(v.label, lx + 14, baseY + 18)
    lx += 60
  })
}

function drawDonut(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  height: number,
  data: { label: string; value: number; color: string }[],
): void {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) {
    doc.fillColor(GRIS).rect(x, y, width, height).fill()
    return
  }
  let cx = x
  data.forEach((d) => {
    const segWidth = (d.value / total) * width
    doc.fillColor(d.color).rect(cx, y, segWidth, height).fill()
    cx += segWidth
  })
  doc
    .fillColor(NOIR)
    .fontSize(7)
    .text(`Total : ${total} véhicules`, x, y + height + 6)
  doc
    .fillColor(NOIR)
    .fontSize(6)
    .text(
      data.map((d) => `${d.label}: ${d.value}`).join("   "),
      x,
      y + height + 16,
    )
}

export function ficheClient(
  doc: Doc,
  fiche: ClientFiche,
  locations: LocationFiche[],
): void {
  header(
    doc,
    "Fiche client",
    `Hertz Bénin — éditée le ${new Date().toLocaleDateString("fr-FR")}`,
  )
  doc.fillColor(NOIR).fontSize(14).font("Helvetica-Bold").text(fiche.nom)
  doc.fontSize(10).font("Helvetica")
  doc.text(`Type : ${fiche.type}`)
  doc.text(`Téléphone : ${fiche.telephone}`)
  doc.text(`Locations : ${fiche.locationsCount}`)
  doc.text(`Dernière opération : ${fiche.derniereOperation ?? "—"}`)
  doc.moveDown()
  const total = locations.reduce((sum, l) => sum + l.montant, 0)
  doc.fontSize(12).font("Helvetica-Bold").text("Historique des prestations")
  doc.moveDown(0.5)
  if (locations.length === 0) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor(GRIS)
      .text("Aucune location enregistrée.")
  }
  for (const l of locations) {
    doc
      .fillColor(NOIR)
      .fontSize(10)
      .font("Helvetica")
      .text(
        `${l.reference} — ${l.vehicule} (${l.type}) · ${l.dateDebut} → ${l.dateFin} · ${formatMontant(l.montant)} · ${l.statut}`,
      )
    doc.moveDown(0.2)
  }
  doc.moveDown()
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(`Total dépensé : ${formatMontant(total)}`)
}

export function rapportActivite(
  doc: Doc,
  periode: string,
  stats: OverviewStats,
  monthly: MonthlyPoint[],
): void {
  header(doc, "Rapport d'activité", `Hertz Bénin — période : ${periode}`)
  kpiLine(
    doc,
    "Chiffre d'affaires",
    `${formatMontant(stats.caTotal)} (${stats.caCroissance})`,
  )
  kpiLine(
    doc,
    "Véhicules disponibles",
    `${stats.vehiculesDisponibles} sur ${stats.vehiculesTotal}`,
  )
  kpiLine(doc, "Locations actives", `${stats.locationsActives} contrats`)
  kpiLine(
    doc,
    "Réservations en attente",
    `${stats.reservationsEnAttente} demandes`,
  )
  doc.moveDown(0.5)

  // Graphique : locations par mois
  sectionTitle(doc, "Locations par mois (courte / longue durée)")
  drawBarChart(
    doc,
    50,
    doc.y,
    250,
    140,
    monthly.map((m) => ({
      label: m.mois,
      values: [
        { label: "Courte", value: m.courte },
        { label: "Longue", value: m.longue },
      ],
    })),
    [JAUNE, VERT],
  )
  doc.y += 180

  // Graphique : état de la flotte
  sectionTitle(doc, "État de la flotte")
  drawDonut(doc, 50, doc.y, 250, 14, [
    { label: "Disponibles", value: stats.vehiculesDisponibles, color: VERT },
    { label: "En location", value: stats.locationsActives, color: BLEU },
    {
      label: "Indisponibles",
      value:
        stats.vehiculesTotal -
        stats.vehiculesDisponibles -
        stats.locationsActives,
      color: ROUGE,
    },
  ])
  doc.y += 50
}
