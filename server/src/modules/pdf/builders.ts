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
  doc.fillColor(GRIS).fontSize(9).font("Helvetica").text(label, { continued: true })
  doc.fillColor(NOIR).font("Helvetica-Bold").text(`  ${value}`)
  doc.moveDown(0.3)
}

export function ficheClient(doc: Doc, fiche: ClientFiche, locations: LocationFiche[]): void {
  header(doc, "Fiche client", `Hertz Bénin — éditée le ${new Date().toLocaleDateString("fr-FR")}`)
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
    doc.fontSize(10).font("Helvetica").fillColor(GRIS).text("Aucune location enregistrée.")
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
  doc.fontSize(11).font("Helvetica-Bold").text(`Total dépensé : ${formatMontant(total)}`)
}

export function rapportActivite(
  doc: Doc,
  periode: string,
  stats: OverviewStats,
  monthly: MonthlyPoint[],
): void {
  header(doc, "Rapport d'activité", `Hertz Bénin — période : ${periode}`)
  kpiLine(doc, "Chiffre d'affaires", `${formatMontant(stats.caTotal)} (${stats.caCroissance})`)
  kpiLine(doc, "Véhicules disponibles", `${stats.vehiculesDisponibles} sur ${stats.vehiculesTotal}`)
  kpiLine(doc, "Locations actives", `${stats.locationsActives} contrats`)
  kpiLine(doc, "Réservations en attente", `${stats.reservationsEnAttente} demandes`)
  doc.moveDown()
  doc.fillColor(NOIR).fontSize(12).font("Helvetica-Bold").text("Locations par mois (courte / longue durée)")
  doc.moveDown(0.5)
  doc.fontSize(10).font("Helvetica")
  for (const m of monthly) {
    doc.text(`${m.mois} : ${m.courte} courtes · ${m.longue} longues`)
    doc.moveDown(0.2)
  }
}
