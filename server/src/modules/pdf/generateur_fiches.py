# -*- coding: utf-8 -*-
import argparse
import json
import os
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

BRAND = colors.HexColor("#FFCC00")
DARK = colors.HexColor("#222222")
MUTED = colors.HexColor("#6B6B66")
BORDER = colors.HexColor("#DCDCD6")
CARD = colors.HexColor("#F4F4F1")
ALT = colors.HexColor("#F7F7F4")
def register_fonts(font_dir):
    for name, filename in (
        ("Montserrat", "Montserrat-Regular.ttf"),
        ("Montserrat-Medium", "Montserrat-Medium.ttf"),
        ("Montserrat-SemiBold", "Montserrat-SemiBold.ttf"),
        ("Montserrat-Bold", "Montserrat-Bold.ttf"),
    ):
        pdfmetrics.registerFont(TTFont(name, os.path.join(font_dir, filename)))


def clean(value):
    return escape(str(value if value not in (None, "") else "—"))


def money(value):
    if value in (None, ""):
        return "—"
    return f"{float(value):,.0f}".replace(",", " ") + " F CFA"


def date_label(value):
    if not value:
        return "—"
    date = str(value)[:10]
    parts = date.split("-")
    return f"{parts[2]}/{parts[1]}/{parts[0]}" if len(parts) == 3 else clean(value)


def draw_page(canvas, document, data, logo_path):
    canvas.saveState()
    width, height = A4
    if os.path.exists(logo_path):
        canvas.drawImage(
            logo_path, 15 * mm, height - 23 * mm, width=19 * mm,
            height=12 * mm, preserveAspectRatio=True, mask="auto",
        )
    canvas.setFont("Montserrat-Medium", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 15 * mm, height - 14 * mm, "HERTZ BÉNIN · FICHE DE SUIVI")
    canvas.setStrokeColor(BRAND)
    canvas.setLineWidth(1.5)
    canvas.line(15 * mm, height - 27 * mm, 67 * mm, height - 27 * mm)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(67 * mm, height - 27 * mm, width - 15 * mm, height - 27 * mm)
    canvas.line(15 * mm, 14 * mm, width - 15 * mm, 14 * mm)
    canvas.setFont("Montserrat", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(15 * mm, 9 * mm, "Hertz Bénin · Document confidentiel")
    canvas.drawRightString(width - 15 * mm, 9 * mm, f"Page {document.page}")
    canvas.restoreState()


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle", parent=base["Title"], fontName="Montserrat-Bold",
            fontSize=20, leading=24, textColor=DARK, alignment=TA_LEFT,
            spaceAfter=3 * mm,
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle", fontName="Montserrat", fontSize=8.5,
            leading=12, textColor=MUTED, spaceAfter=5 * mm,
        ),
        "section": ParagraphStyle(
            "Section", fontName="Montserrat-SemiBold", fontSize=10,
            leading=13, textColor=DARK, spaceBefore=4 * mm, spaceAfter=2 * mm,
        ),
        "body": ParagraphStyle(
            "Body", fontName="Montserrat", fontSize=8, leading=11,
            textColor=DARK,
        ),
        "muted": ParagraphStyle(
            "Muted", fontName="Montserrat", fontSize=7, leading=9,
            textColor=MUTED,
        ),
        "card_label": ParagraphStyle(
            "CardLabel", fontName="Montserrat-SemiBold", fontSize=6.5,
            leading=8, textColor=MUTED,
        ),
        "card_value": ParagraphStyle(
            "CardValue", fontName="Montserrat-Bold", fontSize=13,
            leading=16, textColor=DARK,
        ),
        "table_header": ParagraphStyle(
            "TableHeader", fontName="Montserrat-SemiBold", fontSize=6.3,
            leading=8, textColor=DARK,
        ),
        "table_body": ParagraphStyle(
            "TableBody", fontName="Montserrat", fontSize=6.2,
            leading=8, textColor=DARK,
        ),
        "table_right": ParagraphStyle(
            "TableRight", fontName="Montserrat", fontSize=6.2,
            leading=8, textColor=DARK, alignment=TA_RIGHT,
        ),
    }


def section(title, styles):
    return KeepTogether([
        Paragraph(clean(title), styles["section"]),
        Table([[""]], colWidths=[180 * mm], rowHeights=[1.2 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BRAND),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ])),
        Spacer(1, 2 * mm),
    ])


def info_table(items, styles):
    cells = []
    for index in range(0, len(items), 2):
        row = []
        for label, value in items[index:index + 2]:
            row.append(Paragraph(
                f'<font name="Montserrat-SemiBold" color="#6B6B66" size="6.5">{clean(label).upper()}</font>'
                f'<br/><font name="Montserrat-Medium" color="#222222" size="8">{clean(value)}</font>',
                styles["body"],
            ))
        if len(row) == 1:
            row.append("")
        cells.append(row)
    table = Table(cells, colWidths=[90 * mm, 90 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def kpi_cards(items, styles):
    cells = []
    for label, value in items:
        cells.append([
            Paragraph(clean(label).upper(), styles["card_label"]),
            Spacer(1, 1.5 * mm),
            Paragraph(clean(value), styles["card_value"]),
        ])
    table = Table([cells], colWidths=[180 * mm / max(1, len(cells))] * len(cells))
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("LINEBEFORE", (0, 0), (0, -1), 2, BRAND),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return table


def activity_table(headers, rows, widths, styles):
    data = [[Paragraph(clean(value).upper(), styles["table_header"]) for value in headers]]
    for row in rows:
        data.append([
            Paragraph(clean(value), styles["table_right"] if index == len(row) - 2 else styles["table_body"])
            for index, value in enumerate(row)
        ])
    if len(data) == 1:
        data.append([Paragraph("Aucune activité enregistrée.", styles["muted"])] + [""] * (len(headers) - 1))
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ALT]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, DARK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 1.7 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1.7 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.6 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.6 * mm),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("SPAN", (0, 1), (-1, 1)) if len(rows) == 0 else ("LEFTPADDING", (0, 0), (0, 0), 1.7 * mm),
    ]))
    return table


def client_story(data, styles):
    client = data["client"]
    locations = data["locations"]
    total = sum(float(row.get("montant") or 0) for row in locations)
    story = [
        Paragraph("Fiche client", styles["title"]),
        Paragraph(f"Historique des locations · Éditée le {clean(data['issuedAt'])}", styles["subtitle"]),
        info_table([
            ("Nom", client.get("nom")),
            ("Type", client.get("type")),
            ("Téléphone", client.get("telephone")),
            ("E-mail", client.get("email")),
            ("Adresse", client.get("adresse")),
            ("N° de permis", client.get("numPermis")),
        ], styles),
        Spacer(1, 4 * mm),
        kpi_cards([
            ("Locations", str(len(locations))),
            ("Montant total enregistré", money(total)),
            ("Dernière opération", date_label(locations[0].get("dateDebut")) if locations else "—"),
        ], styles),
        Spacer(1, 3 * mm),
        section("Activités de location", styles),
    ]
    rows = [[
        location.get("reference"), location.get("vehicule"), location.get("type"),
        f"{date_label(location.get('dateDebut'))} – {date_label(location.get('dateFin'))}",
        money(location.get("montant")), location.get("statut"),
    ] for location in locations]
    story.append(activity_table(
        ["Contrat", "Véhicule", "Type", "Période", "Montant", "Statut"],
        rows, [25 * mm, 29 * mm, 23 * mm, 37 * mm, 34 * mm, 32 * mm], styles,
    ))
    return story


def commercial_story(data, styles):
    commercial = data["commercial"]
    activities = data["activities"]
    summary = data["summary"]
    story = [
        Paragraph("Fiche de performance commerciale", styles["title"]),
        Paragraph(
            f"Période : {clean(data['period'])} · Éditée le {clean(data['issuedAt'])}",
            styles["subtitle"],
        ),
        info_table([
            ("Nom", commercial.get("nom")),
            ("Abréviation", commercial.get("abreviation")),
            ("Agence", commercial.get("agence")),
            ("Téléphone", commercial.get("telephone")),
            ("E-mail", commercial.get("email")),
            ("Contact", commercial.get("contact")),
        ], styles),
        Spacer(1, 4 * mm),
        kpi_cards([
            ("Locations", str(summary["locations"])),
            ("Réservations", str(summary["reservations"])),
            ("Passages garage", str(summary["garages"])),
            ("Sorties internes", str(summary["internalExits"])),
            ("Ventes conclues", str(summary["sales"])),
        ], styles),
        Spacer(1, 3 * mm),
        kpi_cards([
            ("CA locations", money(summary["rentalRevenue"])),
            ("Montant ventes conclues", money(summary["saleRevenue"])),
            ("Performance locations", commercial.get("performance")),
        ], styles),
        Spacer(1, 3 * mm),
        section("Opérations réalisées", styles),
    ]
    rows = [[
        row.get("type"), row.get("reference"), date_label(row.get("date")),
        row.get("vehicule"), row.get("details"), money(row.get("montant")),
        row.get("statut"),
    ] for row in activities]
    story.append(activity_table(
        ["Opération", "Référence", "Date", "Véhicule", "Détails", "Montant", "Statut"],
        rows, [21 * mm, 24 * mm, 21 * mm, 24 * mm, 44 * mm, 25 * mm, 21 * mm], styles,
    ))
    return story


def main():
    parser = argparse.ArgumentParser(description="Génération des fiches Hertz Bénin")
    parser.add_argument("--output", required=True)
    parser.add_argument("--fonts", required=True)
    parser.add_argument("--logo", required=True)
    parser.add_argument("--data-json", required=True)
    args = parser.parse_args()

    register_fonts(args.fonts)
    with open(args.data_json, "r", encoding="utf-8") as file:
        data = json.load(file)
    styles = build_styles()
    document = SimpleDocTemplate(
        args.output, pagesize=A4,
        rightMargin=15 * mm, leftMargin=15 * mm,
        topMargin=34 * mm, bottomMargin=20 * mm,
        title=data["title"], author="Hertz Bénin",
    )
    story = client_story(data, styles) if data["kind"] == "client" else commercial_story(data, styles)
    document.build(
        story,
        onFirstPage=lambda canvas, doc: draw_page(canvas, doc, data, args.logo),
        onLaterPages=lambda canvas, doc: draw_page(canvas, doc, data, args.logo),
    )
    print(f"[SUCCÈS] Fiche générée : {args.output}")


if __name__ == "__main__":
    main()
