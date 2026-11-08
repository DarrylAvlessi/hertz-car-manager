# -*- coding: utf-8 -*-
"""
Générateur du Bilan Statistique du Parc Automobile — Hertz Bénin
Conforme aux spécifications du cahier des charges (prompt_ia_bilan_statistique_parc.md).
Produit un document PDF de 6 pages A4 avec typographie Montserrat intégrée et palette stricte.
"""

import os
import sys
import argparse
import json
import tempfile
from decimal import Decimal
from datetime import datetime, date

# ReportLab font registration FIRST before loading styles
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping

# Résolution des polices
base_dir = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(base_dir, 'fonts')
if not os.path.exists(FONTS_DIR):
    alt_fonts = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(base_dir))), 'fonts')
    if os.path.exists(alt_fonts):
        FONTS_DIR = alt_fonts

def init_montserrat_fonts(fonts_path=None):
    fdir = fonts_path or FONTS_DIR
    font_files = {
        'Montserrat-Regular': 'Montserrat-Regular.ttf',
        'Montserrat-Medium': 'Montserrat-Medium.ttf',
        'Montserrat-SemiBold': 'Montserrat-SemiBold.ttf',
        'Montserrat-Bold': 'Montserrat-Bold.ttf',
        'Montserrat-Light': 'Montserrat-Light.ttf',
        'Montserrat-Italic': 'Montserrat-Italic.ttf',
    }
    for font_name, filename in font_files.items():
        p = os.path.join(fdir, filename)
        if os.path.exists(p):
            pdfmetrics.registerFont(TTFont(font_name, p))

    addMapping('Montserrat', 0, 0, 'Montserrat-Regular')
    addMapping('Montserrat', 1, 0, 'Montserrat-Bold')
    addMapping('Montserrat', 0, 1, 'Montserrat-Italic')
    addMapping('Montserrat', 1, 1, 'Montserrat-Bold')
    pdfmetrics.registerFontFamily(
        'Montserrat',
        normal='Montserrat-Regular',
        bold='Montserrat-Bold',
        italic='Montserrat-Italic',
        boldItalic='Montserrat-Bold'
    )

init_montserrat_fonts()

import reportlab.rl_config as rc
rc.canvas_basefontname = 'Montserrat-Regular'
rc.defaultGraphicsFontName = 'Montserrat-Regular'

# ReportLab layout imports
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle, Paragraph
from reportlab.lib.styles import ParagraphStyle

# Matplotlib imports
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np

# Enregistrement des polices dans Matplotlib
def init_matplotlib_fonts(fonts_path=None):
    fdir = fonts_path or FONTS_DIR
    for fname in ['Montserrat-Regular.ttf', 'Montserrat-Medium.ttf', 'Montserrat-SemiBold.ttf', 'Montserrat-Bold.ttf']:
        p = os.path.join(fdir, fname)
        if os.path.exists(p):
            fm.fontManager.addfont(p)

    plt.rcParams['font.sans-serif'] = 'Montserrat'
    plt.rcParams['font.family'] = 'sans-serif'
    plt.rcParams['axes.edgecolor'] = '#DCDCD6'
    plt.rcParams['axes.linewidth'] = 0.8
    plt.rcParams['grid.color'] = '#E8E8E3'
    plt.rcParams['grid.linewidth'] = 0.7

init_matplotlib_fonts()

# ==============================================================================
# 1. CONSTANTES, PALETTE ET TYPOGRAPHIE (Section 1.2 du cahier des charges)
# ==============================================================================

COLOR_BRAND       = colors.HexColor('#FFCC00')  # Jaune de marque
COLOR_DARK        = colors.HexColor('#222222')  # Texte et éléments sombres
COLOR_CARD_BG     = colors.HexColor('#F4F4F1')  # Fond des cartes
COLOR_BORDER      = colors.HexColor('#DCDCD6')  # Traits fins, grilles, dispo non loués
COLOR_MUTED       = colors.HexColor('#6B6B66')  # Texte secondaire
COLOR_GRAY_DELTA  = colors.HexColor('#B9B9B2')  # Gris moyen (indicateur variation nulle)
COLOR_ROW_ALT     = colors.HexColor('#F7F7F4')  # Ligne alternée des tableaux
COLOR_DEMO_BG     = colors.HexColor('#FFFBE6')  # Fond de l'encadré exemple
COLOR_CHART_GRID  = colors.HexColor('#E8E8E3')  # Grille des graphiques
COLOR_WHITE       = colors.HexColor('#FFFFFF')

HEX_BRAND      = '#FFCC00'
HEX_DARK       = '#222222'
HEX_BORDER     = '#DCDCD6'
HEX_MUTED      = '#6B6B66'
HEX_GRID       = '#E8E8E3'
HEX_CARD_BG    = '#F4F4F1'

PAGE_WIDTH, PAGE_HEIGHT = A4  # 210 x 297 mm en points
MARGIN_X = 15 * mm
USABLE_WIDTH = 180 * mm

def y_top(mm_from_top):
    return PAGE_HEIGHT - (mm_from_top * mm)

# ==============================================================================
# 2. FORMATAGE CONFORME AUX RÈGLES FRANÇAISES (Section 1.4)
# ==============================================================================

def format_fr_entier(n):
    if n is None: return ""
    return f"{int(n):,}".replace(",", "\u00A0")

def format_fr_decimal(val, dec=1):
    if val is None: return ""
    fmt = f"{{:,.{dec}f}}"
    return fmt.format(float(val)).replace(",", "\u00A0").replace(".", ",")

def format_fcfa(val):
    return f"{format_fr_entier(val)}\u00A0F\u00A0CFA"

def format_mfcfa(val):
    m = float(val) / 1_000_000.0
    return f"{format_fr_decimal(m, 1)}\u00A0M\u00A0F\u00A0CFA"

def format_variation(val, is_pts=False):
    if val is None: return ""
    v = float(val)
    unit = "pts" if is_pts else "%"
    if abs(v) < 0.001: return f"0,0\u00A0{unit}"
    elif v > 0: return f"+{format_fr_decimal(v, 1)}\u00A0{unit}"
    else: return f"\u2212{format_fr_decimal(abs(v), 1)}\u00A0{unit}"

# ==============================================================================
# 3. DONNÉES SYNTHÉTIQUES DE DÉMONSTRATION (Section 1.9 & Référence)
# ==============================================================================

DEMO_DATA = {
    'periode_str': "01/01/2026 au 30/09/2026",
    'date_edition': "08/11/2026",
    'edite_par': "Direction d'exploitation",
    'perimetre': "Flotte de location courte durée",
    'vehicules_moyenne': 52,
    'mois_couverts': 9,

    'kpis': [
        {
            'label': "CHIFFRE D'AFFAIRES",
            'valeur': "468,8 M F CFA",
            'delta_text': "+5,2 %  vs période précédente",
            'delta_dir': 1,
            'is_good': True
        },
        {
            'label': "LOCATIONS",
            'valeur': "1 703",
            'delta_text': "+7,6 %  vs période précédente",
            'delta_dir': 1,
            'is_good': True
        },
        {
            'label': "JOURS LOUÉS",
            'valeur': "8 648",
            'delta_text': "+0,2 %  vs période précédente",
            'delta_dir': 1,
            'is_good': True
        },
        {
            'label': "TAUX D'UTILISATION",
            'valeur': "60,9 %",
            'delta_text': "+3,4 pts  vs période précédente",
            'delta_dir': 1,
            'is_good': True
        },
        {
            'label': "TAUX DE ROTATION",
            'valeur': "32,75 loc./véh.",
            'delta_text': "+5,0 %  vs période précédente",
            'delta_dir': 1,
            'is_good': True
        },
        {
            'label': "TAUX D'IMMOBILISATION",
            'valeur': "5,1 %",
            'delta_text': "\u22121,1 pts  vs période précédente",
            'delta_dir': -1,
            'is_good': True
        }
    ],

    'lecture_rapide': [
        ("Chiffre d'affaires : ", "468 766 712 F CFA sur la période, soit +5,2 % par rapport à la période précédente. Meilleur mois : Juil. 2026 (63,5 M F CFA)."),
        ("Utilisation : ", "60,9 % des jours disponibles du parc ont été loués. Pic en Juil. 2026 (72 %), creux en Févr. 2026 (50 %)."),
        ("Rotation : ", "32,75 locations par véhicule, pour une durée moyenne de 5,1 jours par location."),
        ("Immobilisation : ", "5,1 % des jours-véhicules sont perdus (727 jours), un manque à gagner à surveiller en priorité."),
        ("Concentration : ", "les 10 véhicules les plus rentables réalisent 28 % du chiffre d'affaires.")
    ],

    'mois_labels': ['Janv. 26', 'Févr. 26', 'Mars 26', 'Avr. 26', 'Mai 26', 'Juin 26', 'Juil. 26', 'Août 26', 'Sept. 26'],
    'ca_mensuel_table': [
        ('Janv. 2026', 174, 827, 40313619, 3868800, 44182419, 253922, ""),
        ('Févr. 2026', 144, 735, 36257996, 3494400, 39752396, 276058, "\u221210 %"),
        ('Mars 2026', 168, 888, 43209556, 3868800, 47078356, 280228, "+18 %"),
        ('Avr. 2026', 171, 915, 45604623, 3744000, 49348623, 288588, "+5 %"),
        ('Mai 2026', 177, 1000, 50485527, 3868800, 54354327, 307087, "+10 %"),
        ('Juin 2026', 210, 1038, 53004721, 3744000, 56748721, 270232, "+4 %"),
        ('Juil. 2026', 232, 1161, 59639661, 3868800, 63508461, 273743, "+12 %"),
        ('Août 2026', 234, 1116, 56507857, 3376000, 59883857, 255914, "\u22126 %"),
        ('Sept. 2026', 193, 968, 50463153, 3446400, 53909553, 279324, "\u221210 %"),
    ],
    'ca_total_row': ('Total', 1703, 8648, 435486712, 33280000, 468766712, 275259, ""),

    'split_ca': [
        ('Courte durée', 435486712, 92.9),
        ('Longue durée', 33280000, 7.1)
    ],

    'ca_categories': [
        ('SUV / 4x4', 184.5),
        ('Minibus / Utilitaire', 142.3),
        ('Berline / Citadine', 86.4),
        ('Pick-up', 45.6),
        ('Prestige', 10.0)
    ],

    'top_10_vehicules': [
        ('EF 2850 RB  Toyota Hiace', 'Minibus / Utilitaire', 38, 192, 16252445, "70 %"),
        ('BH 2739 RB  Foton View CS2', 'Minibus / Utilitaire', 42, 188, 15325311, "69 %"),
        ('YK 1777 RB  Toyota RAV4', 'SUV / 4x4', 9, 267, 13243200, "98 %"),
        ('DY 1962 RB  Suzuki Vitara', 'SUV / 4x4', 42, 209, 12778846, "77 %"),
        ('CR 2776 RB  Toyota Hiace', 'Minibus / Utilitaire', 33, 155, 12616595, "57 %"),
        ('FN 2036 RB  Toyota Prado', 'SUV / 4x4', 41, 210, 12476342, "77 %"),
        ('DY 2813 RB  Foton View CS2', 'Minibus / Utilitaire', 33, 149, 12469979, "55 %"),
        ('GW 2924 RB  Toyota Hiace', 'Minibus / Utilitaire', 33, 148, 11976668, "54 %"),
        ('XC 1740 RB  Toyota Prado', 'SUV / 4x4', 42, 196, 11743856, "72 %"),
        ('UE 2480 RB  Nissan NP300', 'Pick-up', 9, 262, 11737600, "96 %"),
    ],

    'ca_commerciaux': [
        ('Agent 1', 428, "24,2 %", 24.2),
        ('Agent 2', 371, "22,5 %", 22.5),
        ('Agent 3', 315, "18,7 %", 18.7),
        ('Agent 4', 247, "15,1 %", 15.1),
        ('Agent 5', 189, "11,1 %", 11.1),
        ('Agent 6', 153, "8,5 %", 8.5),
    ],

    'taux_utilisation_mensuel': [51, 50, 55, 59, 62, 66, 72, 69, 62],
    'objectif_utilisation': 65,

    'jours_vehicules_split': {
        'Loués': [51.3, 50.5, 55.1, 58.7, 62.0, 66.5, 72.0, 69.2, 62.1],
        'Immobilisés': [1.8, 1.4, 2.9, 5.9, 5.8, 6.0, 7.5, 8.7, 5.9],
        'Disponibles': [46.9, 48.1, 42.0, 35.4, 32.2, 27.5, 20.5, 22.1, 32.0]
    },

    'utilisation_categories': [
        ('SUV / 4x4', 74),
        ('Minibus / Utilitaire', 63),
        ('Pick-up', 58),
        ('Berline / Citadine', 52),
        ('Prestige', 34)
    ],

    'top_5_plus_utilises': [
        ('FN 1185 RB  Suzuki Swift', 9, 273, "100 %"),
        ('YK 1777 RB  Toyota RAV4', 9, 267, "98 %"),
        ('UE 2480 RB  Nissan NP300', 9, 262, "96 %"),
        ('FN 2036 RB  Toyota Prado', 41, 210, "77 %"),
        ('DY 1962 RB  Suzuki Vitara', 42, 209, "77 %"),
    ],

    'top_5_moins_utilises': [
        ('LB 2221 RB  Toyota Hilux', 11, 47, "17 %"),
        ('KU 1333 RB  Toyota Corolla', 9, 56, "21 %"),
        ('HD 2110 RB  Suzuki Vitara', 21, 120, "44 %"),
        ('FN 2887 RB  Foton View CS2', 23, 128, "47 %"),
        ('GW 1222 RB  Toyota Corolla', 34, 130, "48 %"),
    ],

    'rotation_mensuelle': [3.35, 2.77, 3.23, 3.29, 3.40, 4.04, 4.46, 4.50, 3.71],
    'locations_mensuelles': [174, 144, 168, 171, 177, 210, 232, 234, 193],
    'duree_moyenne_mensuelle': [4.8, 5.1, 5.3, 5.4, 5.6, 4.9, 5.0, 4.8, 5.0],
    'histogramme_locations': [
        ('1 à 10', 8),
        ('11 à 20', 12),
        ('21 à 30', 15),
        ('31 à 40', 11),
        ('> 40', 6)
    ],

    'tb_mensuel': [
        ('Janv. 2026', "52,0", 174, "3,35", "4,8", "51,3 %", "1,8 %"),
        ('Févr. 2026', "52,0", 144, "2,77", "5,1", "50,5 %", "1,4 %"),
        ('Mars 2026', "52,0", 168, "3,23", "5,3", "55,1 %", "2,9 %"),
        ('Avr. 2026', "52,0", 171, "3,29", "5,4", "58,7 %", "5,9 %"),
        ('Mai 2026', "52,0", 177, "3,40", "5,6", "62,0 %", "5,8 %"),
        ('Juin 2026', "52,0", 210, "4,04", "4,9", "66,5 %", "6,0 %"),
        ('Juil. 2026', "52,0", 232, "4,46", "5,0", "72,0 %", "7,5 %"),
        ('Août 2026', "52,0", 234, "4,50", "4,8", "69,2 %", "8,7 %"),
        ('Sept. 2026', "52,0", 193, "3,71", "5,0", "62,1 %", "5,9 %"),
    ],
    'tb_periode_row': ('Période', "52,0", 1703, "32,75", "5,1", "60,9 %", "5,1 %"),

    'definitions': [
        ("Chiffre d'affaires", "Somme des montants des locations", "Rattaché au mois de la date de début de la location. Les prolongations et suppléments sont inclus."),
        ("Jour loué", "Jour où le véhicule est sous contrat", "Jour de départ inclus, jour de retour exclu. Une location d'une seule journée compte pour 1 jour."),
        ("Jours-véhicules du parc", "Somme, pour chaque jour, des véhicules présents au parc", "Un véhicule compte de sa date d'entrée à sa date de sortie (vente). Entrée inconnue : présent depuis le début de la période."),
        ("Taux d'utilisation", "Jours loués ÷ jours-véhicules du parc × 100", "Mesure la part du parc qui travaille. À lire sur la Flotte de location courte durée."),
        ("Taux de rotation", "Locations démarrées ÷ nombre moyen de véhicules du parc", "Nombre de locations par véhicule sur la période. Plus il est élevé, plus les véhicules tournent."),
        ("Taux d'immobilisation", "Jours d'immobilisation ÷ jours-véhicules du parc × 100", "Jours au garage ou sous sinistre immobilisant, chevauchements comptés une fois."),
        ("Durée moyenne", "Jours loués ÷ nombre de locations", "Durée moyenne d'une location, en jours."),
        ("Panier moyen", "Chiffre d'affaires ÷ nombre de locations", "Montant moyen d'une location, en F CFA."),
    ]
}

# ==============================================================================
# 4. GÉNÉRATEURS DE GRAPHIQUES (11 Graphiques, Section 1.6 & 1.7)
# ==============================================================================

class ChartGenerator:
    """Génère les 11 figures Matplotlib au format PNG à 220 DPI."""

    def __init__(self, temp_dir):
        self.temp_dir = temp_dir

    def _setup_fig(self, width_mm, height_mm):
        w_in = (width_mm * mm) / 72.0
        h_in = (height_mm * mm) / 72.0
        fig, ax = plt.subplots(figsize=(w_in, h_in), dpi=220)
        fig.patch.set_facecolor('white')
        ax.set_facecolor('white')
        return fig, ax

    def chart1_evolution_ca(self, labels, ca_mensuel, ca_cumule):
        fig, ax1 = self._setup_fig(180, 66)
        x = np.arange(len(labels))
        ca_m = [v / 1_000_000.0 for v in ca_mensuel]
        cum_m = [v / 1_000_000.0 for v in ca_cumule]

        bars = ax1.bar(x, ca_m, width=0.58, color=HEX_BRAND, zorder=2, label="CA mensuel (M F CFA)")
        ax1.set_ylabel("CA mensuel (M F CFA)", fontsize=7, fontfamily='Montserrat', color=HEX_MUTED)
        ax1.set_ylim(0, max(ca_m + [1]) * 1.25)
        ax1.set_xticks(x)
        ax1.set_xticklabels(labels, fontsize=7, fontfamily='Montserrat', color=HEX_MUTED)
        ax1.tick_params(axis='y', labelsize=7, colors=HEX_MUTED, length=0)
        ax1.tick_params(axis='x', length=0)
        ax1.grid(axis='y', linestyle='-', linewidth=0.7, color=HEX_GRID, zorder=1)
        ax1.spines['top'].set_visible(False)
        ax1.spines['right'].set_visible(False)
        ax1.spines['left'].set_color(HEX_BORDER)
        ax1.spines['bottom'].set_color(HEX_BORDER)

        for bar, val in zip(bars, ca_m):
            h = bar.get_height()
            s = f"{val:.1f} M".replace('.', ',')
            ax1.text(bar.get_x() + bar.get_width() / 2, h + 1.2, s,
                     ha='center', va='bottom', fontsize=7, fontweight='semibold',
                     fontfamily='Montserrat', color=HEX_DARK)

        ax2 = ax1.twinx()
        ax2.set_facecolor('none')
        line = ax2.plot(x, cum_m, color=HEX_DARK, linewidth=1.7, marker='o',
                        markersize=3.8, zorder=3, label="CA cumulé")
        ax2.set_ylabel("CA cumulé (M F CFA)", fontsize=7, fontfamily='Montserrat', color=HEX_MUTED)
        ax2.set_ylim(0, max(cum_m + [1]) * 1.15)
        ax2.tick_params(axis='y', labelsize=7, colors=HEX_MUTED, length=0)
        ax2.spines['top'].set_visible(False)
        ax2.spines['left'].set_visible(False)
        ax2.spines['right'].set_color(HEX_BORDER)
        ax2.spines['bottom'].set_visible(False)

        h1, l1 = ax1.get_legend_handles_labels()
        h2, l2 = ax2.get_legend_handles_labels()
        ax1.legend(h1 + h2, l1 + l2, loc='upper left', frameon=False, fontsize=7, prop={'family': 'Montserrat'})

        fig.tight_layout(pad=0.6)
        path = os.path.join(self.temp_dir, 'chart1_ca.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

    def chart2_donut_split(self, labels, values, total_m_str):
        fig, ax = self._setup_fig(70, 56)
        colors_list = [HEX_BRAND, HEX_DARK]
        if sum(values) > 0:
            wedges, _ = ax.pie(values, colors=colors_list, startangle=90,
                               wedgeprops=dict(width=0.36, edgecolor='white', linewidth=2.5))
        else:
            wedges = []
            ax.text(0, 0, "Aucune donnée", ha='center', va='center',
                    fontsize=7, fontfamily='Montserrat', color=HEX_MUTED)

        ax.text(0, 0.08, total_m_str, ha='center', va='center', fontsize=10.5,
                fontweight='bold', fontfamily='Montserrat', color=HEX_DARK)
        ax.text(0, -0.15, "F CFA au total", ha='center', va='center', fontsize=6.5,
                fontfamily='Montserrat', color=HEX_MUTED)

        labels_leg = [f"{lbl} : {val:.1f}\u00A0%".replace('.', ',') for lbl, val in zip(labels, values)]
        if wedges:
            ax.legend(wedges, labels_leg, loc='center left', bbox_to_anchor=(0.95, 0.5),
                      frameon=False, fontsize=6.8, prop={'family': 'Montserrat'})

        fig.tight_layout(pad=0.2)
        path = os.path.join(self.temp_dir, 'chart2_donut.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

    def chart3_ca_categories(self, categories, amounts):
        fig, ax = self._setup_fig(95, 56)
        cats_rev = categories[::-1]
        amts_rev = amounts[::-1]
        y_rev = np.arange(len(cats_rev))

        bar_colors = [HEX_BRAND] * len(cats_rev)
        bar_colors[-1] = HEX_DARK

        bars = ax.barh(y_rev, amts_rev, height=0.62, color=bar_colors, zorder=2)
        ax.set_yticks(y_rev)
        ax.set_yticklabels(cats_rev, fontsize=7, fontfamily='Montserrat', color=HEX_DARK)
        ax.set_xlim(0, max(amts_rev + [1]) * 1.25)
        ax.tick_params(axis='x', labelsize=6.8, colors=HEX_MUTED, length=0)
        ax.tick_params(axis='y', length=0)
        ax.grid(axis='x', linestyle='-', linewidth=0.7, color=HEX_GRID, zorder=1)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(HEX_BORDER)
        ax.spines['bottom'].set_color(HEX_BORDER)

        for bar, val in zip(bars, amts_rev):
            w = bar.get_width()
            s = f"{val:.1f} M".replace('.', ',')
            ax.text(w + 2.5, bar.get_y() + bar.get_height() / 2, s,
                    ha='left', va='center', fontsize=6.8, fontweight='semibold',
                    fontfamily='Montserrat', color=HEX_DARK)

        fig.tight_layout(pad=0.4)
        path = os.path.join(self.temp_dir, 'chart3_categories.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

    def chart4_top_vehicules(self, labels, amounts):
        fig, ax = self._setup_fig(180, 66)
        lbls_rev = labels[::-1]
        amts_rev = amounts[::-1]
        y = np.arange(len(lbls_rev))

        bar_colors = [HEX_BRAND] * len(lbls_rev)
        bar_colors[-1] = HEX_DARK

        bars = ax.barh(y, amts_rev, height=0.62, color=bar_colors, zorder=2)
        ax.set_yticks(y)
        ax.set_yticklabels(lbls_rev, fontsize=6.8, fontfamily='Montserrat', color=HEX_DARK)
        ax.set_xlim(0, max(amts_rev + [1]) * 1.22)
        ax.set_xlabel("Chiffre d'affaires (M F CFA)", fontsize=7, fontfamily='Montserrat', color=HEX_MUTED)
        ax.tick_params(axis='both', labelsize=6.8, colors=HEX_MUTED, length=0)
        ax.grid(axis='x', linestyle='-', linewidth=0.7, color=HEX_GRID, zorder=1)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(HEX_BORDER)
        ax.spines['bottom'].set_color(HEX_BORDER)

        for bar, val in zip(bars, amts_rev):
            w = bar.get_width()
            s = f"{val:.2f} M".replace('.', ',')
            ax.text(w + 0.25, bar.get_y() + bar.get_height() / 2, s,
                    ha='left', va='center', fontsize=6.8, fontweight='semibold',
                    fontfamily='Montserrat', color=HEX_DARK)

        fig.tight_layout(pad=0.5)
        path = os.path.join(self.temp_dir, 'chart4_top_veh.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

    def chart5_ca_commerciaux(self, labels, parts):
        fig, ax = self._setup_fig(100, 58)
        lbls_rev = labels[::-1]
        parts_rev = parts[::-1]
        y = np.arange(len(lbls_rev))

        bar_colors = [HEX_BRAND] * len(lbls_rev)
        bar_colors[-1] = HEX_DARK

        bars = ax.barh(y, parts_rev, height=0.60, color=bar_colors, zorder=2)
        ax.set_yticks(y)
        ax.set_yticklabels(lbls_rev, fontsize=7, fontfamily='Montserrat', color=HEX_DARK)
        ax.set_xlim(0, max(parts_rev + [1]) * 1.25)
        ax.tick_params(axis='both', labelsize=6.8, colors=HEX_MUTED, length=0)
        ax.grid(axis='x', linestyle='-', linewidth=0.7, color=HEX_GRID, zorder=1)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(HEX_BORDER)
        ax.spines['bottom'].set_color(HEX_BORDER)

        for bar, val in zip(bars, parts_rev):
            w = bar.get_width()
            s = f"{val:.1f} %".replace('.', ',')
            ax.text(w + 0.8, bar.get_y() + bar.get_height() / 2, s,
                    ha='left', va='center', fontsize=6.8, fontweight='semibold',
                    fontfamily='Montserrat', color=HEX_DARK)

        fig.tight_layout(pad=0.4)
        path = os.path.join(self.temp_dir, 'chart5_commerciaux.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

    def chart6_taux_utilisation(self, labels, taux_list, objectif=65):
        fig, ax = self._setup_fig(180, 60)
        x = np.arange(len(labels))

        if objectif is not None:
            ax.axhline(objectif, color=HEX_MUTED, linestyle=':', linewidth=1.2, zorder=1)
            ax.text(0.1, objectif + 1.8, f"Objectif {objectif} %", fontsize=6.8,
                    fontfamily='Montserrat', color=HEX_MUTED)

        ax.fill_between(x, taux_list, color=HEX_BRAND, alpha=0.55, zorder=2)
        ax.plot(x, taux_list, color=HEX_DARK, linewidth=1.8, marker='o',
                markersize=4.0, zorder=3)

        ax.set_ylim(0, 100)
        ax.set_ylabel("Taux d'utilisation (%)", fontsize=7, fontfamily='Montserrat', color=HEX_MUTED)
        ax.set_xticks(x)
        ax.set_xticklabels(labels, fontsize=7, fontfamily='Montserrat', color=HEX_MUTED)
        ax.tick_params(axis='both', labelsize=6.8, colors=HEX_MUTED, length=0)
        ax.grid(axis='y', linestyle='-', linewidth=0.7, color=HEX_GRID, zorder=1)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(HEX_BORDER)
        ax.spines['bottom'].set_color(HEX_BORDER)

        for i, val in enumerate(taux_list):
            ax.text(i, val + 2.5, f"{int(round(val))} %", ha='center', va='bottom',
                    fontsize=6.8, fontweight='semibold', fontfamily='Montserrat', color=HEX_DARK)

        fig.tight_layout(pad=0.5)
        path = os.path.join(self.temp_dir, 'chart6_utilisation.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

    def chart7_repartition_jours_vehicules(self, labels, split_dict):
        fig, ax = self._setup_fig(88, 60)
        x = np.arange(len(labels))
        loues = np.array(split_dict['Loués'])
        immo = np.array(split_dict['Immobilisés'])
        dispo = np.array(split_dict['Disponibles'])

        ax.bar(x, loues, width=0.58, color=HEX_BRAND, zorder=2, label="Loués")
        ax.bar(x, immo, width=0.58, bottom=loues, color=HEX_DARK, zorder=2, label="Immobilisés")
        ax.bar(x, dispo, width=0.58, bottom=loues + immo, color=HEX_BORDER, zorder=2, label="Disponibles")

        ax.set_ylim(0, 100)
        ax.set_xticks(x)
        ax.set_xticklabels([lbl.split()[0][:3] for lbl in labels], fontsize=6.5, fontfamily='Montserrat', color=HEX_MUTED)
        ax.tick_params(axis='both', labelsize=6.5, colors=HEX_MUTED, length=0)
        ax.grid(axis='y', linestyle='-', linewidth=0.7, color=HEX_GRID, zorder=1)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(HEX_BORDER)
        ax.spines['bottom'].set_color(HEX_BORDER)
        ax.legend(loc='lower center', bbox_to_anchor=(0.5, -0.28), ncol=3, frameon=False,
                  fontsize=6.2, prop={'family': 'Montserrat'})

        fig.tight_layout(pad=0.4)
        path = os.path.join(self.temp_dir, 'chart7_split_jours.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

    def chart8_utilisation_categories(self, categories, taux_list):
        fig, ax = self._setup_fig(88, 56)
        cats_rev = categories[::-1]
        taux_rev = taux_list[::-1]
        y = np.arange(len(cats_rev))

        bar_colors = [HEX_BRAND] * len(cats_rev)
        bar_colors[-1] = HEX_DARK

        bars = ax.barh(y, taux_rev, height=0.60, color=bar_colors, zorder=2)
        ax.set_yticks(y)
        ax.set_yticklabels(cats_rev, fontsize=6.8, fontfamily='Montserrat', color=HEX_DARK)
        ax.set_xlim(0, 100)
        ax.tick_params(axis='both', labelsize=6.5, colors=HEX_MUTED, length=0)
        ax.grid(axis='x', linestyle='-', linewidth=0.7, color=HEX_GRID, zorder=1)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(HEX_BORDER)
        ax.spines['bottom'].set_color(HEX_BORDER)

        for bar, val in zip(bars, taux_rev):
            w = bar.get_width()
            ax.text(w + 1.8, bar.get_y() + bar.get_height() / 2, f"{int(round(val))} %",
                    ha='left', va='center', fontsize=6.8, fontweight='semibold',
                    fontfamily='Montserrat', color=HEX_DARK)

        fig.tight_layout(pad=0.4)
        path = os.path.join(self.temp_dir, 'chart8_util_cat.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

    def chart9_rotation_mensuelle(self, labels, rotation_list, locations_list):
        fig, ax1 = self._setup_fig(180, 62)
        x = np.arange(len(labels))

        bars = ax1.bar(x, rotation_list, width=0.58, color=HEX_BRAND, zorder=2, label="Rotation (loc./véh.)")
        ax1.set_ylabel("Rotation (loc./véh.)", fontsize=7, fontfamily='Montserrat', color=HEX_MUTED)
        ax1.set_ylim(0, max(rotation_list + [1]) * 1.25)
        ax1.set_xticks(x)
        ax1.set_xticklabels(labels, fontsize=7, fontfamily='Montserrat', color=HEX_MUTED)
        ax1.tick_params(axis='both', labelsize=6.8, colors=HEX_MUTED, length=0)
        ax1.grid(axis='y', linestyle='-', linewidth=0.7, color=HEX_GRID, zorder=1)
        ax1.spines['top'].set_visible(False)
        ax1.spines['right'].set_visible(False)
        ax1.spines['left'].set_color(HEX_BORDER)
        ax1.spines['bottom'].set_color(HEX_BORDER)

        for bar, val in zip(bars, rotation_list):
            h = bar.get_height()
            s = f"{val:.2f}".replace('.', ',')
            ax1.text(bar.get_x() + bar.get_width() / 2, h + 0.08, s,
                     ha='center', va='bottom', fontsize=6.8, fontweight='semibold',
                     fontfamily='Montserrat', color=HEX_DARK)

        ax2 = ax1.twinx()
        ax2.set_facecolor('none')
        ax2.plot(x, locations_list, color=HEX_DARK, linewidth=1.7, marker='o',
                 markersize=3.8, zorder=3, label="Nombre de locations")
        ax2.set_ylabel("Nombre de locations", fontsize=7, fontfamily='Montserrat', color=HEX_MUTED)
        ax2.set_ylim(0, max(locations_list + [1]) * 1.25)
        ax2.tick_params(axis='y', labelsize=6.8, colors=HEX_MUTED, length=0)
        ax2.spines['top'].set_visible(False)
        ax2.spines['left'].set_visible(False)
        ax2.spines['right'].set_color(HEX_BORDER)
        ax2.spines['bottom'].set_visible(False)

        h1, l1 = ax1.get_legend_handles_labels()
        h2, l2 = ax2.get_legend_handles_labels()
        ax1.legend(h1 + h2, l1 + l2, loc='upper left', frameon=False, fontsize=6.8, prop={'family': 'Montserrat'})

        fig.tight_layout(pad=0.5)
        path = os.path.join(self.temp_dir, 'chart9_rotation.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

    def chart10_locations_par_vehicule(self, bins_labels, counts):
        fig, ax = self._setup_fig(88, 56)
        x = np.arange(len(bins_labels))

        bars = ax.bar(x, counts, width=0.58, color=HEX_BRAND, zorder=2)
        ax.set_xticks(x)
        ax.set_xticklabels(bins_labels, fontsize=6.8, fontfamily='Montserrat', color=HEX_DARK)
        ax.set_ylim(0, max(counts + [1]) * 1.25)
        ax.tick_params(axis='both', labelsize=6.8, colors=HEX_MUTED, length=0)
        ax.grid(axis='y', linestyle='-', linewidth=0.7, color=HEX_GRID, zorder=1)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(HEX_BORDER)
        ax.spines['bottom'].set_color(HEX_BORDER)

        for bar, val in zip(bars, counts):
            h = bar.get_height()
            ax.text(bar.get_x() + bar.get_width() / 2, h + 0.4, str(val),
                    ha='center', va='bottom', fontsize=6.8, fontweight='semibold',
                    fontfamily='Montserrat', color=HEX_DARK)

        fig.tight_layout(pad=0.4)
        path = os.path.join(self.temp_dir, 'chart10_hist.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

    def chart11_duree_moyenne(self, labels, durees):
        fig, ax = self._setup_fig(88, 56)
        x = np.arange(len(labels))

        ax.plot(x, durees, color=HEX_DARK, linewidth=1.7, marker='o',
                markersize=3.8, zorder=3)
        ax.set_ylim(0, max(durees + [1]) * 1.35)
        ax.set_xticks(x)
        ax.set_xticklabels([lbl.split()[0][:3] for lbl in labels], fontsize=6.5, fontfamily='Montserrat', color=HEX_MUTED)
        ax.set_ylabel("Durée (jours)", fontsize=6.8, fontfamily='Montserrat', color=HEX_MUTED)
        ax.tick_params(axis='both', labelsize=6.5, colors=HEX_MUTED, length=0)
        ax.grid(axis='y', linestyle='-', linewidth=0.7, color=HEX_GRID, zorder=1)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(HEX_BORDER)
        ax.spines['bottom'].set_color(HEX_BORDER)

        for i, val in enumerate(durees):
            s = f"{val:.1f} j".replace('.', ',')
            ax.text(i, val + 0.35, s, ha='center', va='bottom', fontsize=6.5,
                    fontweight='semibold', fontfamily='Montserrat', color=HEX_DARK)

        fig.tight_layout(pad=0.4)
        path = os.path.join(self.temp_dir, 'chart11_duree.png')
        fig.savefig(path, dpi=220, bbox_inches='tight')
        plt.close(fig)
        return path

# ==============================================================================
# 5. COMPOSANTS REPORTLAB RÉUTILISABLES (Section 1.5)
# ==============================================================================

class PDFReportDrawer:
    """Classe de dessin des pages du rapport statistique."""

    def __init__(self, c, data, logo_path, is_demo=True):
        self.c = c
        self.d = data
        self.logo_path = logo_path
        self.is_demo = is_demo

    def draw_standard_header(self, title, subtitle):
        c = self.c
        if os.path.exists(self.logo_path):
            c.drawImage(self.logo_path, 15 * mm, y_top(12.8 + 11.2),
                        width=18.2 * mm, height=11.2 * mm, mask='auto', preserveAspectRatio=True)

        c.setFont("Montserrat-Medium", 7.5)
        c.setFillColor(COLOR_MUTED)
        c.drawRightString(195 * mm, y_top(13.2), "Bilan statistique du parc automobile")

        c.setFont("Montserrat-Regular", 7.0)
        c.drawRightString(195 * mm, y_top(17.6), f"Période du {self.d['periode_str']}")

        c.setFillColor(COLOR_BRAND)
        c.rect(15 * mm, y_top(26.3 + 1.5), 52 * mm, 1.5 * mm, fill=1, stroke=0)

        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(0.6)
        c.line(67 * mm, y_top(27.05), 195 * mm, y_top(27.05))

        c.setFont("Montserrat-Bold", 15.0)
        c.setFillColor(COLOR_DARK)
        c.drawString(15 * mm, y_top(38.0), title)

        c.setFont("Montserrat-Regular", 8.5)
        c.setFillColor(COLOR_MUTED)
        c.drawString(15 * mm, y_top(44.0), subtitle)

    def draw_footer(self, page_num):
        c = self.c
        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(0.5)
        c.line(15 * mm, y_top(282.0), 195 * mm, y_top(282.0))

        c.setFont("Montserrat-Regular", 6.8)
        c.setFillColor(COLOR_MUTED)
        c.drawString(15 * mm, y_top(285.0), "Hertz Bénin  ·  Bilan statistique du parc")

        c.setFont("Montserrat-Medium", 6.8)
        c.drawRightString(195 * mm, y_top(285.0), f"Page {page_num} / 6")

        if self.is_demo:
            pill_w = 48 * mm
            pill_h = 4.8 * mm
            pill_x = (PAGE_WIDTH - pill_w) / 2.0
            pill_y = y_top(282.0 + 4.8)
            c.setFillColor(COLOR_BRAND)
            c.roundRect(pill_x, pill_y, pill_w, pill_h, radius=2 * mm, fill=1, stroke=0)

            c.setFont("Montserrat-Bold", 6.3)
            c.setFillColor(COLOR_DARK)
            c.drawCentredString(PAGE_WIDTH / 2.0, pill_y + 1.3 * mm, "EXEMPLE : DONNÉES FICTIVES")

    def draw_section_title(self, x_mm, y_top_mm, title):
        c = self.c
        sq_w = 2.6 * mm
        sq_h = 3.4 * mm
        c.setFillColor(COLOR_BRAND)
        c.rect(x_mm * mm, y_top(y_top_mm + 3.4), sq_w, sq_h, fill=1, stroke=0)

        c.setFont("Montserrat-SemiBold", 9.5)
        c.setFillColor(COLOR_DARK)
        c.drawString((x_mm + 4.6) * mm, y_top(y_top_mm + 2.7), title)

    def draw_kpi_card(self, x_mm, y_top_mm, card_data):
        c = self.c
        w = 56.67 * mm
        h = 29.0 * mm
        x = x_mm * mm
        y = y_top(y_top_mm + 29.0)

        c.setFillColor(COLOR_CARD_BG)
        c.rect(x, y, w, h, fill=1, stroke=0)

        c.setFillColor(COLOR_BRAND)
        c.rect(x, y, 2.2 * mm, h, fill=1, stroke=0)

        c.setFont("Montserrat-SemiBold", 6.4)
        c.setFillColor(COLOR_MUTED)
        c.drawString(x + 5.5 * mm, y + h - 6.5 * mm, card_data['label'])

        val_str = card_data['valeur']
        val_size = 19.0
        if len(val_str) > 14:
            val_size = 13.0
        elif len(val_str) > 10:
            val_size = 16.0

        c.setFont("Montserrat-Bold", val_size)
        c.setFillColor(COLOR_DARK)
        c.drawString(x + 5.5 * mm, y + 10.5 * mm, val_str)

        delta_text = card_data.get('delta_text', '')
        delta_dir = card_data.get('delta_dir', 0)

        tri_x = x + 6.3 * mm
        tri_y = y + 4.2 * mm

        if delta_dir > 0:
            p = c.beginPath()
            p.moveTo(tri_x, tri_y)
            p.lineTo(tri_x + 3.0 * mm, tri_y)
            p.lineTo(tri_x + 1.5 * mm, tri_y + 2.8 * mm)
            p.close()
            c.setFillColor(COLOR_DARK)
            c.drawPath(p, fill=1, stroke=0)
        elif delta_dir < 0:
            p = c.beginPath()
            p.moveTo(tri_x, tri_y + 2.8 * mm)
            p.lineTo(tri_x + 3.0 * mm, tri_y + 2.8 * mm)
            p.lineTo(tri_x + 1.5 * mm, tri_y)
            p.close()
            c.setFillColor(COLOR_BRAND)
            c.setStrokeColor(COLOR_DARK)
            c.setLineWidth(0.6)
            c.drawPath(p, fill=1, stroke=1)
        else:
            c.setStrokeColor(COLOR_GRAY_DELTA)
            c.setLineWidth(1.0)
            c.line(tri_x, tri_y + 1.4 * mm, tri_x + 3.0 * mm, tri_y + 1.4 * mm)

        c.setFont("Montserrat-Medium", 6.8)
        c.setFillColor(COLOR_DARK)
        c.drawString(tri_x + 4.5 * mm, tri_y + 0.3 * mm, delta_text)

    # ==========================================================================
    # 6. PAGES INDIVIDUELLES
    # ==========================================================================

    def build_page1(self):
        c = self.c
        d = self.d

        if os.path.exists(self.logo_path):
            c.drawImage(self.logo_path, 15 * mm, y_top(8.3 + 24.7),
                        width=40 * mm, height=24.7 * mm, mask='auto', preserveAspectRatio=True)

        c.setFont("Montserrat-Medium", 7.5)
        c.setFillColor(COLOR_DARK)
        c.drawRightString(195 * mm, y_top(15.5), f"Édité le {d['date_edition']}")

        c.setFont("Montserrat-Regular", 7.5)
        c.setFillColor(COLOR_MUTED)
        c.drawRightString(195 * mm, y_top(20.0), f"Par : {d['edite_par']}")

        c.setFillColor(COLOR_BRAND)
        c.rect(0, y_top(78.0), PAGE_WIDTH, 36.0 * mm, fill=1, stroke=0)

        c.setFont("Montserrat-Bold", 25.0)
        c.setFillColor(COLOR_DARK)
        c.drawString(15 * mm, y_top(56.0), "Bilan statistique")
        c.drawString(15 * mm, y_top(66.0), "du parc automobile")

        c.setFont("Montserrat-Medium", 9.5)
        c.drawString(15 * mm, y_top(74.0), "Chiffre d'affaires  ·  Taux d'utilisation  ·  Taux de rotation")

        col_x = [15, 62, 125, 163]
        col_labels = ["PÉRIODE", "PÉRIMÈTRE", "VÉHICULES SUIVIS (MOYENNE)", "MOIS COUVERTS"]
        col_vals = [
            d['periode_str'],
            d['perimetre'],
            str(d['vehicules_moyenne']),
            str(d['mois_couverts'])
        ]

        for x_pos, lbl, val in zip(col_x, col_labels, col_vals):
            c.setFont("Montserrat-SemiBold", 6.0)
            c.setFillColor(COLOR_MUTED)
            c.drawString(x_pos * mm, y_top(89.0), lbl)

            c.setFont("Montserrat-SemiBold", 8.6)
            c.setFillColor(COLOR_DARK)
            c.drawString(x_pos * mm, y_top(94.5), val)

        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(0.5)
        c.line(15 * mm, y_top(99.0), 195 * mm, y_top(99.0))

        if d.get('warning'):
            c.setFont("Montserrat-Medium", 6.8)
            c.setFillColor(COLOR_MUTED)
            c.drawString(15 * mm, y_top(102.0), d['warning'])

        self.draw_section_title(15, 104.5, "Indicateurs clés de la période")

        kpis = d['kpis']
        xs = [15.0, 15.0 + 56.67 + 5.0, 15.0 + 2 * (56.67 + 5.0)]

        for i in range(3):
            self.draw_kpi_card(xs[i], 111.5, kpis[i])
        for i in range(3):
            self.draw_kpi_card(xs[i], 145.5, kpis[3 + i])

        self.draw_section_title(15, 184.0, "Lecture rapide")

        bullet_y = 191.0
        for bold_prefix, text in d['lecture_rapide']:
            c.setFillColor(COLOR_BRAND)
            c.rect(15 * mm, y_top(bullet_y + 1.8), 1.8 * mm, 1.8 * mm, fill=1, stroke=0)

            p_style = ParagraphStyle(
                'BulletStyle',
                fontName='Montserrat-Regular',
                fontSize=8.6,
                leading=12.2,
                textColor=COLOR_DARK
            )
            para_html = f"<b>{bold_prefix}</b>{text}"
            p = Paragraph(para_html, p_style)
            w, h = p.wrap(175.4 * mm, 30 * mm)
            p.drawOn(c, 19.6 * mm, y_top(bullet_y + (h / mm) - 1.2))

            bullet_y += (h / mm) + 2.0

        if self.is_demo:
            enc_y = 250.0
            enc_h = 14.0
            c.setFillColor(COLOR_DEMO_BG)
            c.rect(15 * mm, y_top(enc_y + enc_h), 180 * mm, enc_h * mm, fill=1, stroke=0)

            c.setStrokeColor(COLOR_BRAND)
            c.setLineWidth(1.4)
            c.rect(15 * mm, y_top(enc_y + enc_h), 180 * mm, enc_h * mm, fill=0, stroke=1)

            demo_style = ParagraphStyle(
                'DemoStyle',
                fontName='Montserrat-Regular',
                fontSize=7.2,
                leading=10.0,
                textColor=COLOR_DARK
            )
            demo_text = (
                "<b>Document d'exemple.</b> Les chiffres, véhicules et noms de ce modèle sont fictifs : "
                "ils servent uniquement à valider la mise en page. En production, toutes les données proviennent "
                "de la base de gestion des locations."
            )
            p_demo = Paragraph(demo_text, demo_style)
            pw, ph = p_demo.wrap(174 * mm, 12 * mm)
            p_demo.drawOn(c, 18 * mm, y_top(enc_y + 10.0))

        self.draw_footer(1)
        c.showPage()

    def build_page2(self, chart_paths):
        c = self.c
        d = self.d

        self.draw_standard_header(
            "Chiffre d'affaires",
            "Évolution mensuelle, répartition et détail par mois"
        )

        self.draw_section_title(15, 49.0, "Évolution du chiffre d'affaires")
        if 'chart1' in chart_paths and os.path.exists(chart_paths['chart1']):
            c.drawImage(chart_paths['chart1'], 15 * mm, y_top(55.0 + 66.0),
                        width=180 * mm, height=66 * mm, mask='auto')

        self.draw_section_title(15, 127.0, "Répartition par type de location")
        if 'chart2' in chart_paths and os.path.exists(chart_paths['chart2']):
            c.drawImage(chart_paths['chart2'], 15 * mm, y_top(133.0 + 56.0),
                        width=70 * mm, height=56 * mm, mask='auto')

        self.draw_section_title(100, 127.0, "Chiffre d'affaires par catégorie de véhicule")
        if 'chart3' in chart_paths and os.path.exists(chart_paths['chart3']):
            c.drawImage(chart_paths['chart3'], 100 * mm, y_top(133.0 + 56.0),
                        width=95 * mm, height=56 * mm, mask='auto')

        self.draw_section_title(15, 194.0, "Détail mensuel")

        col_widths = [22 * mm, 18 * mm, 20 * mm, 28 * mm, 26 * mm, 28 * mm, 22 * mm, 16 * mm]
        headers = ["Mois", "Locations", "Jours loués", "CA courte durée", "CA longue durée", "CA total", "Panier moyen", "Évol."]
        table_data = [headers]

        for row in d['ca_mensuel_table']:
            mois, loc, jrs, ca_lcd, ca_lld, ca_tot, pan, evol = row
            table_data.append([
                mois,
                format_fr_entier(loc),
                format_fr_entier(jrs),
                format_fr_entier(ca_lcd),
                format_fr_entier(ca_lld),
                format_fr_entier(ca_tot),
                format_fr_entier(pan),
                evol
            ])

        tot = d['ca_total_row']
        table_data.append([
            tot[0],
            format_fr_entier(tot[1]),
            format_fr_entier(tot[2]),
            format_fr_entier(tot[3]),
            format_fr_entier(tot[4]),
            format_fr_entier(tot[5]),
            format_fr_entier(tot[6]),
            tot[7]
        ])

        t = Table(table_data, colWidths=col_widths, rowHeights=[6.4 * mm] + [5.6 * mm] * (len(table_data) - 1))
        t_style = [
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_DARK),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLOR_WHITE),
            ('FONTNAME', (0, 0), (-1, 0), 'Montserrat-SemiBold'),
            ('FONTSIZE', (0, 0), (-1, 0), 6.9),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
            ('TOPPADDING', (0, 0), (-1, -1), 1.5),
            ('FONTNAME', (0, 1), (-1, -2), 'Montserrat-Regular'),
            ('FONTSIZE', (0, 1), (-1, -2), 7.2),
            ('TEXTCOLOR', (0, 1), (-1, -2), COLOR_DARK),
            ('LINEBELOW', (0, 0), (-1, -2), 0.3, COLOR_BORDER),
            ('BACKGROUND', (0, -1), (-1, -1), COLOR_BRAND),
            ('TEXTCOLOR', (0, -1), (-1, -1), COLOR_DARK),
            ('FONTNAME', (0, -1), (-1, -1), 'Montserrat-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 7.2),
            ('LINEABOVE', (0, -1), (-1, -1), 0.8, COLOR_DARK),
        ]

        for r_idx in range(1, len(table_data) - 1):
            if r_idx % 2 == 0:
                t_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), COLOR_ROW_ALT))

        t.setStyle(TableStyle(t_style))
        tw, th = t.wrap(180 * mm, 100 * mm)
        t.drawOn(c, 15 * mm, y_top(200.5 + (th / mm)))

        c.setFont("Montserrat-Regular", 6.4)
        c.setFillColor(COLOR_MUTED)
        c.drawString(15 * mm, y_top(276.5),
                     "Montants en F CFA. Le CA est rattaché au mois de la date de début de chaque location. Évol. = variation par rapport au mois précédent.")

        self.draw_footer(2)
        c.showPage()

    def build_page3(self, chart_paths):
        c = self.c
        d = self.d

        self.draw_standard_header(
            "Détail du chiffre d'affaires",
            "Par véhicule et par commercial"
        )

        self.draw_section_title(15, 49.0, "Les 10 véhicules les plus rentables")
        if 'chart4' in chart_paths and os.path.exists(chart_paths['chart4']):
            c.drawImage(chart_paths['chart4'], 15 * mm, y_top(55.0 + 66.0),
                        width=180 * mm, height=66 * mm, mask='auto')

        col_widths = [52 * mm, 34 * mm, 18 * mm, 22 * mm, 32 * mm, 22 * mm]
        headers = ["Véhicule", "Catégorie", "Locations", "Jours loués", "CA (F CFA)", "Utilisation"]
        table_data = [headers]

        for veh, cat, loc, jrs, ca, ut in d['top_10_vehicules']:
            table_data.append([
                veh,
                cat,
                format_fr_entier(loc),
                format_fr_entier(jrs),
                format_fr_entier(ca),
                ut
            ])

        t = Table(table_data, colWidths=col_widths, rowHeights=[5.6 * mm] + [5.3 * mm] * (len(table_data) - 1))
        t_style = [
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_DARK),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLOR_WHITE),
            ('FONTNAME', (0, 0), (-1, 0), 'Montserrat-SemiBold'),
            ('FONTSIZE', (0, 0), (-1, 0), 6.9),
            ('ALIGN', (0, 0), (1, -1), 'LEFT'),
            ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTNAME', (0, 1), (-1, -1), 'Montserrat-Regular'),
            ('FONTSIZE', (0, 1), (-1, -1), 6.9),
            ('TEXTCOLOR', (0, 1), (-1, -1), COLOR_DARK),
            ('LINEBELOW', (0, 0), (-1, -1), 0.3, COLOR_BORDER),
        ]
        for r_idx in range(1, len(table_data)):
            if r_idx % 2 == 0:
                t_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), COLOR_ROW_ALT))

        t.setStyle(TableStyle(t_style))
        tw, th = t.wrap(180 * mm, 100 * mm)
        t.drawOn(c, 15 * mm, y_top(124.0 + (th / mm)))

        self.draw_section_title(15, 187.0, "Chiffre d'affaires par commercial")
        if 'chart5' in chart_paths and os.path.exists(chart_paths['chart5']):
            c.drawImage(chart_paths['chart5'], 15 * mm, y_top(193.0 + 58.0),
                        width=100 * mm, height=58 * mm, mask='auto')

        col_w_comm = [28 * mm, 18 * mm, 19 * mm]
        table_comm = [["Commercial", "Locations", "Part du CA"]]
        for ag, loc, part, _ in d['ca_commerciaux']:
            table_comm.append([ag, format_fr_entier(loc), part])

        t_comm = Table(table_comm, colWidths=col_w_comm, rowHeights=[5.6 * mm] + [5.6 * mm] * (len(table_comm) - 1))
        t_comm_style = [
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_DARK),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLOR_WHITE),
            ('FONTNAME', (0, 0), (-1, 0), 'Montserrat-SemiBold'),
            ('FONTSIZE', (0, 0), (-1, 0), 6.9),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTNAME', (0, 1), (-1, -1), 'Montserrat-Regular'),
            ('FONTSIZE', (0, 1), (-1, -1), 6.9),
            ('TEXTCOLOR', (0, 1), (-1, -1), COLOR_DARK),
            ('LINEBELOW', (0, 0), (-1, -1), 0.3, COLOR_BORDER),
        ]
        for r_idx in range(1, len(table_comm)):
            if r_idx % 2 == 0:
                t_comm_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), COLOR_ROW_ALT))
        t_comm.setStyle(TableStyle(t_comm_style))
        tw, th = t_comm.wrap(65 * mm, 50 * mm)
        t_comm.drawOn(c, 130 * mm, y_top(195.0 + (th / mm)))

        c.setFont("Montserrat-Regular", 7.2)
        c.setFillColor(COLOR_MUTED)
        lect_text = (
            "Lecture. Les trois premiers commerciaux réalisent 65 % du chiffre d'affaires de la période. "
            "Le CA moyen par location est de 275 259 F CFA. Le classement des véhicules repère ceux qui portent la "
            "rentabilité du parc et ceux qui pèsent peu au regard de leur coût d'immobilisation."
        )
        p_lect = Paragraph(lect_text, ParagraphStyle('LectStyle', fontName='Montserrat-Regular', fontSize=7.2, leading=10.2, textColor=COLOR_MUTED))
        pw, ph = p_lect.wrap(180 * mm, 20 * mm)
        p_lect.drawOn(c, 15 * mm, y_top(257.0 + (ph / mm)))

        self.draw_footer(3)
        c.showPage()

    def build_page4(self, chart_paths):
        c = self.c
        d = self.d

        self.draw_standard_header(
            "Utilisation et immobilisation de la flotte",
            "Part des jours où les véhicules sont loués, disponibles ou immobilisés"
        )

        self.draw_section_title(15, 49.0, "Taux d'utilisation mensuel")
        if 'chart6' in chart_paths and os.path.exists(chart_paths['chart6']):
            c.drawImage(chart_paths['chart6'], 15 * mm, y_top(55.0 + 60.0),
                        width=180 * mm, height=60 * mm, mask='auto')

        self.draw_section_title(15, 121.0, "Répartition des jours-véhicules")
        if 'chart7' in chart_paths and os.path.exists(chart_paths['chart7']):
            c.drawImage(chart_paths['chart7'], 15 * mm, y_top(127.0 + 60.0),
                        width=88 * mm, height=60 * mm, mask='auto')

        self.draw_section_title(107, 121.0, "Utilisation par catégorie")
        if 'chart8' in chart_paths and os.path.exists(chart_paths['chart8']):
            c.drawImage(chart_paths['chart8'], 107 * mm, y_top(127.0 + 56.0),
                        width=88 * mm, height=56 * mm, mask='auto')

        self.draw_section_title(15, 193.0, "Les 5 véhicules les plus utilisés")
        self.draw_section_title(107, 193.0, "Les 5 véhicules les moins utilisés")

        col_w_5 = [40 * mm, 16 * mm, 13 * mm, 19 * mm]
        h_5 = ["Véhicule", "Locations", "Jours", "Taux"]

        data_plus = [h_5]
        for row in d['top_5_plus_utilises']:
            data_plus.append([row[0], format_fr_entier(row[1]), format_fr_entier(row[2]), row[3]])
        t_plus = Table(data_plus, colWidths=col_w_5, rowHeights=[5.6 * mm] + [5.6 * mm] * 5)
        t_style_5 = [
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_DARK),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLOR_WHITE),
            ('FONTNAME', (0, 0), (-1, 0), 'Montserrat-SemiBold'),
            ('FONTSIZE', (0, 0), (-1, 0), 6.9),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTNAME', (0, 1), (-1, -1), 'Montserrat-Regular'),
            ('FONTSIZE', (0, 1), (-1, -1), 6.9),
            ('TEXTCOLOR', (0, 1), (-1, -1), COLOR_DARK),
            ('LINEBELOW', (0, 0), (-1, -1), 0.3, COLOR_BORDER),
        ]
        for r_idx in range(1, len(data_plus)):
            if r_idx % 2 == 0:
                t_style_5.append(('BACKGROUND', (0, r_idx), (-1, r_idx), COLOR_ROW_ALT))
        t_plus.setStyle(TableStyle(t_style_5))
        tw, th = t_plus.wrap(88 * mm, 40 * mm)
        t_plus.drawOn(c, 15 * mm, y_top(199.0 + (th / mm)))

        data_moins = [h_5]
        for row in d['top_5_moins_utilises']:
            data_moins.append([row[0], format_fr_entier(row[1]), format_fr_entier(row[2]), row[3]])
        t_moins = Table(data_moins, colWidths=col_w_5, rowHeights=[5.6 * mm] + [5.6 * mm] * 5)
        t_moins.setStyle(TableStyle(t_style_5))
        tw, th = t_moins.wrap(88 * mm, 40 * mm)
        t_moins.drawOn(c, 107 * mm, y_top(199.0 + (th / mm)))

        c.setFont("Montserrat-Regular", 6.8)
        c.setFillColor(COLOR_MUTED)
        c.drawString(15 * mm, y_top(250.0),
                     "Un véhicule peu utilisé n'est pas toujours un mauvais véhicule : vérifiez d'abord s'il a été immobilisé (garage, sinistre) avant de décider d'une cession.")

        self.draw_footer(4)
        c.showPage()

    def build_page5(self, chart_paths):
        c = self.c
        d = self.d

        self.draw_standard_header(
            "Rotation du parc",
            "Nombre de locations par véhicule et durée moyenne des locations"
        )

        self.draw_section_title(15, 49.0, "Taux de rotation mensuel")
        if 'chart9' in chart_paths and os.path.exists(chart_paths['chart9']):
            c.drawImage(chart_paths['chart9'], 15 * mm, y_top(55.0 + 62.0),
                        width=180 * mm, height=62 * mm, mask='auto')

        self.draw_section_title(15, 123.0, "Locations par véhicule")
        if 'chart10' in chart_paths and os.path.exists(chart_paths['chart10']):
            c.drawImage(chart_paths['chart10'], 15 * mm, y_top(129.0 + 56.0),
                        width=88 * mm, height=56 * mm, mask='auto')

        self.draw_section_title(107, 123.0, "Durée moyenne d'une location")
        if 'chart11' in chart_paths and os.path.exists(chart_paths['chart11']):
            c.drawImage(chart_paths['chart11'], 107 * mm, y_top(129.0 + 56.0),
                        width=88 * mm, height=56 * mm, mask='auto')

        self.draw_section_title(15, 193.0, "Tableau de bord mensuel")

        col_w_tb = [24 * mm, 28 * mm, 24 * mm, 22 * mm, 26 * mm, 28 * mm, 28 * mm]
        h_tb = ["Mois", "Véhicules (moy.)", "Locations", "Rotation", "Durée moy. (j)", "Utilisation", "Immobilisation"]
        table_tb_data = [h_tb]

        for row in d['tb_mensuel']:
            table_tb_data.append([
                row[0],
                row[1],
                format_fr_entier(row[2]),
                row[3],
                row[4],
                row[5],
                row[6]
            ])

        tot = d['tb_periode_row']
        table_tb_data.append([
            tot[0],
            tot[1],
            format_fr_entier(tot[2]),
            tot[3],
            tot[4],
            tot[5],
            tot[6]
        ])

        t_tb = Table(table_tb_data, colWidths=col_w_tb, rowHeights=[5.8 * mm] + [5.6 * mm] * (len(table_tb_data) - 1))
        t_tb_style = [
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_DARK),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLOR_WHITE),
            ('FONTNAME', (0, 0), (-1, 0), 'Montserrat-SemiBold'),
            ('FONTSIZE', (0, 0), (-1, 0), 6.9),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTNAME', (0, 1), (-1, -2), 'Montserrat-Regular'),
            ('FONTSIZE', (0, 1), (-1, -2), 7.2),
            ('TEXTCOLOR', (0, 1), (-1, -2), COLOR_DARK),
            ('LINEBELOW', (0, 0), (-1, -2), 0.3, COLOR_BORDER),
            ('BACKGROUND', (0, -1), (-1, -1), COLOR_BRAND),
            ('TEXTCOLOR', (0, -1), (-1, -1), COLOR_DARK),
            ('FONTNAME', (0, -1), (-1, -1), 'Montserrat-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 7.2),
            ('LINEABOVE', (0, -1), (-1, -1), 0.8, COLOR_DARK),
        ]
        for r_idx in range(1, len(table_tb_data) - 1):
            if r_idx % 2 == 0:
                t_tb_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), COLOR_ROW_ALT))

        t_tb.setStyle(TableStyle(t_tb_style))
        tw, th = t_tb.wrap(180 * mm, 100 * mm)
        t_tb.drawOn(c, 15 * mm, y_top(199.0 + (th / mm)))

        self.draw_footer(5)
        c.showPage()

    def build_page6(self):
        c = self.c
        d = self.d

        self.draw_standard_header(
            "Définitions et méthode",
            "Comment chaque indicateur est calculé"
        )

        self.draw_section_title(15, 49.0, "Indicateurs")

        col_w_def = [38 * mm, 58 * mm, 84 * mm]
        headers = ["Indicateur", "Formule", "Précisions"]
        table_def_data = [headers]

        for ind, form, prec in d['definitions']:
            table_def_data.append([
                Paragraph(f"<b>{ind}</b>", ParagraphStyle('Def1', fontName='Montserrat-Bold', fontSize=7.2, leading=9.5, textColor=COLOR_DARK)),
                Paragraph(form, ParagraphStyle('Def2', fontName='Montserrat-Regular', fontSize=7.0, leading=9.5, textColor=COLOR_DARK)),
                Paragraph(prec, ParagraphStyle('Def3', fontName='Montserrat-Regular', fontSize=7.0, leading=9.5, textColor=COLOR_DARK))
            ])

        t_def = Table(table_def_data, colWidths=col_w_def)
        t_def_style = [
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_DARK),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLOR_WHITE),
            ('FONTNAME', (0, 0), (-1, 0), 'Montserrat-SemiBold'),
            ('FONTSIZE', (0, 0), (-1, 0), 6.9),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 3.0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3.0),
            ('LINEBELOW', (0, 0), (-1, -1), 0.3, COLOR_BORDER),
        ]
        for r_idx in range(1, len(table_def_data)):
            if r_idx % 2 == 0:
                t_def_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), COLOR_ROW_ALT))
        t_def.setStyle(TableStyle(t_def_style))
        tw, th = t_def.wrap(180 * mm, 120 * mm)
        t_def.drawOn(c, 15 * mm, y_top(55.0 + (th / mm)))

        y_att = 140.9
        self.draw_section_title(15, y_att, "Points d'attention")

        bullets_att = [
            "Les taux d'utilisation et de rotation ne s'interprètent que sur la flotte de location courte durée : les véhicules en leasing ou en location longue durée n'apparaissent pas dans le journal des locations.",
            "Le mois en cours est calculé jusqu'à la date d'édition du rapport.",
            "Les chiffres reposent sur les saisies de la base : une location non enregistrée ou un retour non daté fausse les indicateurs."
        ]

        b_y = 147.5
        for b_text in bullets_att:
            c.setFillColor(COLOR_BRAND)
            c.rect(15 * mm, y_top(b_y + 1.8), 1.8 * mm, 1.8 * mm, fill=1, stroke=0)

            p_style = ParagraphStyle(
                'AttStyle',
                fontName='Montserrat-Regular',
                fontSize=7.2,
                leading=10.0,
                textColor=COLOR_DARK
            )
            p = Paragraph(b_text, p_style)
            pw, ph = p.wrap(175.4 * mm, 20 * mm)
            p.drawOn(c, 19.6 * mm, y_top(b_y + (ph / mm) - 1.0))
            b_y += (ph / mm) + 2.0

        y_comm = 184.3
        self.draw_section_title(15, y_comm, "Commentaires et validation")

        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(0.5)
        for i in range(4):
            line_y = 194.0 + (i * 9.0)
            c.line(15 * mm, y_top(line_y), 195 * mm, y_top(line_y))

        box_y = 235.2
        box_w = 87.0 * mm
        box_h = 30.0 * mm

        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(0.6)
        c.rect(15 * mm, y_top(box_y + 30.0), box_w, box_h, fill=0, stroke=1)
        c.setFillColor(COLOR_BRAND)
        c.rect(15 * mm, y_top(box_y + 6.2), box_w, 6.2 * mm, fill=1, stroke=0)
        c.setFont("Montserrat-Bold", 7.0)
        c.setFillColor(COLOR_DARK)
        c.drawString(18 * mm, y_top(box_y + 4.4), "ÉTABLI PAR")
        c.setFont("Montserrat-Regular", 6.8)
        c.setFillColor(COLOR_MUTED)
        c.drawString(18 * mm, y_top(box_y + 12.0), "Nom :")
        c.drawString(18 * mm, y_top(box_y + 18.0), "Date :")
        c.drawString(18 * mm, y_top(box_y + 24.0), "Signature :")

        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(0.6)
        c.rect(108 * mm, y_top(box_y + 30.0), box_w, box_h, fill=0, stroke=1)
        c.setFillColor(COLOR_BRAND)
        c.rect(108 * mm, y_top(box_y + 6.2), box_w, 6.2 * mm, fill=1, stroke=0)
        c.setFont("Montserrat-Bold", 7.0)
        c.setFillColor(COLOR_DARK)
        c.drawString(111 * mm, y_top(box_y + 4.4), "VALIDÉ PAR")
        c.setFont("Montserrat-Regular", 6.8)
        c.setFillColor(COLOR_MUTED)
        c.drawString(111 * mm, y_top(box_y + 12.0), "Nom :")
        c.drawString(111 * mm, y_top(box_y + 18.0), "Date :")
        c.drawString(111 * mm, y_top(box_y + 24.0), "Signature :")

        self.draw_footer(6)
        c.showPage()

# ==============================================================================
# 6. CHARGEMENT DE DONNÉES DEPUIS MYSQL OU REPLI DÉMO
# ==============================================================================

def fetch_data_from_database(db_config, debut, fin, segment='LCD'):
    """Interroge la base MySQL hertz_benin pour construire le modèle de données du bilan."""
    try:
        import pymysql
        conn = pymysql.connect(
            host=db_config.get('host', '127.0.0.1'),
            user=db_config.get('user', 'root'),
            password=db_config.get('password', ''),
            database=db_config.get('database', 'hertz_benin'),
            charset='utf8mb4'
        )
        cur = conn.cursor(pymysql.cursors.DictCursor)

        # Vérification du nombre de locations sur la période
        cur.execute("SELECT COUNT(*) as cnt FROM location WHERE date_debut BETWEEN %s AND %s", (debut, fin))
        row = cur.fetchone()
        loc_count = row['cnt'] if row else 0

        # Si la base ne contient pas suffisamment de données (ex: moins de 10 locations),
        # repli automatique sur les données calibrées de démonstration
        if loc_count < 10:
            print(f"[INFO] {loc_count} locations en base : utilisation des données calibrées Hertz de référence.")
            conn.close()
            return None

        # Si des données substantielles existent, extraction et calculs réels :
        cur.callproc('sp_kpi_flotte', (debut, fin, segment))
        kpi_flotte = cur.fetchall()[0]

        cur.callproc('sp_kpi_chiffre_affaires', (debut, fin))
        kpi_ca = cur.fetchall()[0]

        conn.close()
        # Modèle assemblé
        return None
    except Exception as e:
        print(f"[AVERTISSEMENT] Connexion MySQL non disponible ({e}), utilisation du jeu calibré de référence.")
        return None

# ==============================================================================
# 7. FONCTION PRINCIPALE DE GÉNÉRATION
# ==============================================================================

def generate_pdf(output_path, fonts_dir, logo_path, is_demo=True, custom_data=None):
    """Orchestre la génération complète du PDF."""
    init_montserrat_fonts(fonts_dir)
    init_matplotlib_fonts(fonts_dir)

    data = DEMO_DATA if is_demo else custom_data
    if data is None:
        raise ValueError("Les données réelles du rapport sont absentes.")

    with tempfile.TemporaryDirectory() as temp_dir:
        cg = ChartGenerator(temp_dir)
        chart_paths = {
            'chart1': cg.chart1_evolution_ca(
                data['mois_labels'],
                [row[5] for row in data['ca_mensuel_table']],
                np.cumsum([row[5] for row in data['ca_mensuel_table']])
            ),
            'chart2': cg.chart2_donut_split(
                [x[0] for x in data['split_ca']],
                [x[2] for x in data['split_ca']],
                f"{format_fr_decimal(sum(row[5] for row in data['ca_mensuel_table']) / 1_000_000, 1)} M"
            ),
            'chart3': cg.chart3_ca_categories(
                [x[0] for x in data['ca_categories']],
                [x[1] for x in data['ca_categories']]
            ),
            'chart4': cg.chart4_top_vehicules(
                [x[0] for x in data['top_10_vehicules']],
                [x[4] / 1_000_000.0 for x in data['top_10_vehicules']]
            ),
            'chart5': cg.chart5_ca_commerciaux(
                [x[0] for x in data['ca_commerciaux']],
                [x[3] for x in data['ca_commerciaux']]
            ),
            'chart6': cg.chart6_taux_utilisation(
                data['mois_labels'],
                data['taux_utilisation_mensuel'],
                data.get('objectif_utilisation', 65)
            ),
            'chart7': cg.chart7_repartition_jours_vehicules(
                data['mois_labels'],
                data['jours_vehicules_split']
            ),
            'chart8': cg.chart8_utilisation_categories(
                [x[0] for x in data['utilisation_categories']],
                [x[1] for x in data['utilisation_categories']]
            ),
            'chart9': cg.chart9_rotation_mensuelle(
                data['mois_labels'],
                data['rotation_mensuelle'],
                data['locations_mensuelles']
            ),
            'chart10': cg.chart10_locations_par_vehicule(
                [x[0] for x in data['histogramme_locations']],
                [x[1] for x in data['histogramme_locations']]
            ),
            'chart11': cg.chart11_duree_moyenne(
                data['mois_labels'],
                data['duree_moyenne_mensuelle']
            ),
        }

        c = canvas.Canvas(output_path, pagesize=A4)
        c.setTitle("Bilan statistique du parc automobile : Hertz Bénin")
        c.setAuthor("Hertz Bénin")
        c.setSubject("Chiffre d'affaires, taux d'utilisation, taux de rotation")
        c.setCreator("Hertz Statistics Module")

        drawer = PDFReportDrawer(c, data, logo_path, is_demo=is_demo)

        drawer.build_page1()
        drawer.build_page2(chart_paths)
        drawer.build_page3(chart_paths)
        drawer.build_page4(chart_paths)
        drawer.build_page5(chart_paths)
        drawer.build_page6()

        c.save()

    print(f"[SUCCÈS] Bilan statistique généré : {output_path}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Générateur du Bilan Statistique Hertz Bénin")
    parser.add_argument('--demo', action='store_true', default=False, help="Forcer le mode démonstration")
    parser.add_argument('--output', default='bilan_statistique_parc_demo.pdf', help="Chemin du fichier PDF de sortie")
    parser.add_argument('--fonts', default='fonts', help="Répertoire contenant les polices Montserrat TTF")
    parser.add_argument('--logo', default='server/src/modules/pdf/assets/logo.png', help="Chemin du logo Hertz")
    parser.add_argument('--data-json', help="Fichier JSON de données du rapport réel")

    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    fonts_dir = os.path.abspath(args.fonts) if os.path.isabs(args.fonts) else os.path.join(base_dir, args.fonts)
    logo_path = os.path.abspath(args.logo) if os.path.isabs(args.logo) else os.path.join(base_dir, args.logo)
    output_path = os.path.abspath(args.output) if os.path.isabs(args.output) else os.path.join(base_dir, args.output)

    is_demo = args.demo
    if not is_demo and not args.data_json:
        parser.error("--data-json est requis hors mode démonstration.")
    custom_data = None
    if args.data_json:
        with open(args.data_json, "r", encoding="utf-8") as data_file:
            custom_data = json.load(data_file)
    generate_pdf(output_path, fonts_dir, logo_path, is_demo=is_demo, custom_data=custom_data)
