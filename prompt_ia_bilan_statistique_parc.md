# Prompt maître : bilan statistique du parc automobile Hertz Bénin

## Mode d'emploi (à lire avant de copier le prompt)

**1. Joignez ces fichiers à votre IA** (le prompt les cite comme références faisant foi) :

| Fichier | Rôle |
|---|---|
| `bilan_statistique_parc_exemple.pdf` | Le modèle visuel à reproduire exactement |
| `generateur_bilan_pdf_hertz.zip` | Implémentation de référence (script, logo, polices Montserrat) |
| `base_donnees_gestion_location.sql` | Schéma de la base, vues et procédures qui fournissent les chiffres |

**2. Copiez tout ce qui se trouve entre « DÉBUT DU PROMPT » et « FIN DU PROMPT ».**

**3. Deux façons de l'utiliser** :
- **En une fois** : collez tout. L'IA traite le Temps 1 puis le Temps 2 et s'arrête entre les deux pour validation.
- **En deux messages** : collez d'abord la partie commune (rôle, contexte, fichiers, règles générales) avec le Temps 1, validez le résultat, puis envoyez le Temps 2.

Les spécifications ci-dessous reprennent exactement celles du PDF modèle. Si vous modifiez le modèle, mettez le prompt à jour en même temps.

---

# DÉBUT DU PROMPT

## RÔLE

Tu es développeur senior spécialisé dans la génération de rapports PDF (ReportLab, matplotlib) et dans les indicateurs de gestion d'un parc de location automobile. Tu écris du code propre, commenté en français, testé, et tu ne livres jamais un résultat que tu n'as pas vérifié.

## CONTEXTE

Hertz Bénin utilise une application de gestion des locations adossée à une base MySQL/MariaDB (script `base_donnees_gestion_location.sql`, version 2). Je veux une fonction « Imprimer le bilan statistique du parc » qui produit un PDF professionnel de 6 pages A4 présentant le **chiffre d'affaires**, le **taux d'utilisation**, le **taux de rotation** du parc, ainsi que le taux d'immobilisation, avec des graphiques.

## FICHIERS DE RÉFÉRENCE

1. `bilan_statistique_parc_exemple.pdf` : modèle visuel. **Il fait foi.**
2. `generateur_bilan_pdf_hertz.zip` : implémentation de référence (Python, ReportLab, matplotlib).
3. `base_donnees_gestion_location.sql` : tables, vues (`v_kpi_flotte_mensuel`, `v_ca_mensuel`, `v_jours_loues_vehicule_mensuel`, `v_duree_vie_vehicule`…) et procédures (`sp_kpi_flotte`, `sp_kpi_chiffre_affaires`).

**Règle de priorité** : en cas de doute ou de contradiction, le PDF modèle l'emporte sur ton interprétation, et ce prompt l'emporte sur tes habitudes. Si tu hésites, tu poses **une seule question précise** ; si je ne réponds pas, tu choisis l'option la plus proche du modèle et tu la notes dans la liste des hypothèses.

## MÉTHODE EN DEUX TEMPS

- **TEMPS 1 : reproduire le modèle et le design à l'identique** (mise en page, polices, couleurs, composants), avec des données de démonstration.
- **TEMPS 2 : respecter la façon dont chaque rapport statistique doit se présenter et se calculer**, avec les données réelles de la base.

À la fin du Temps 1, tu t'arrêtes, tu présentes le PDF de démonstration et la liste de contrôle remplie, puis tu attends mon accord avant le Temps 2.

---

# TEMPS 1 : REPRODUIRE LE MODÈLE ET LE DESIGN

## 1.1 Format et grille

| Élément | Valeur |
|---|---|
| Format | A4 portrait, 210 × 297 mm, 6 pages |
| Marges gauche et droite | 15 mm (largeur utile : 180 mm) |
| Repères verticaux | Mesurés **depuis le haut de la page**, en mm |
| Fond | Blanc. Aucun fond sombre pleine page |
| Images | PNG à 220 dpi, proportions respectées, jamais déformées |

## 1.2 Palette (aucune autre couleur)

| Usage | Code |
|---|---|
| Jaune de marque (barres, bandeaux, puces, total) | `#FFCC00` |
| Texte et éléments sombres | `#222222` |
| Fond des cartes | `#F4F4F1` |
| Traits fins, grilles, « disponibles non loués » | `#DCDCD6` |
| Texte secondaire | `#6B6B66` |
| Gris moyen (indicateur « variation nulle ») | `#B9B9B2` |
| Ligne alternée des tableaux | `#F7F7F4` |
| Fond de l'encadré « exemple » | `#FFFBE6` |
| Grille des graphiques | `#E8E8E3` |

**Contraste** : le jaune sert uniquement de **fond** ou d'accent. Il n'est jamais utilisé comme couleur de texte sur fond blanc. Le texte posé sur du jaune est en `#222222`. Le texte posé sur fond `#222222` est en blanc.

## 1.3 Typographie : Montserrat, intégrée au PDF

Fichiers fournis dans `fonts/` (Light, Regular, Medium, SemiBold, Bold, Italic). Le PDF final ne doit référencer **aucune autre police** (vérifier avec `pdffonts` : uniquement des Montserrat, toutes « emb: yes »).

| Usage | Graisse | Taille |
|---|---|---|
| Titre de couverture (2 lignes) | Bold | 25 pt |
| Titre de page | Bold | 15 pt |
| Sous-titre de page | Regular, gris `#6B6B66` | 8,5 pt |
| Titre de section | SemiBold | 9,5 pt |
| Valeur d'une carte indicateur | Bold | 19 pt (réduite jusqu'à 11 pt si trop large) |
| Libellé d'une carte (MAJUSCULES) | SemiBold, gris | 6,4 pt |
| Texte courant, lecture rapide | Regular | 8,6 pt (interligne 12,6 pt) |
| Cellules des tableaux | Regular | 7,2 pt (6,9 pt dans les tableaux étroits) |
| En-têtes de tableaux | SemiBold, blanc | 6,9 pt |
| Ligne de total | Bold | 7,2 pt |
| Notes et mentions | Regular, gris | 6,4 à 7,2 pt |
| Texte des graphiques | Regular ; valeurs en SemiBold | 7 pt |

## 1.4 Formats de nombres et de textes (français)

- Séparateur de milliers : **espace insécable** (U+00A0). Décimale : **virgule**. Exemple : `468 766 712`, `62,3`.
- Monnaie : `F CFA` (avec espaces insécables). Gros montants : `468,8 M F CFA` (1 décimale).
- Pourcentages : `60,9 %` (espace insécable avant `%`).
- Variations : `+5,2 %` ou `−1,1 pts`, avec le **vrai signe moins** « − » (U+2212), jamais le tiret.
- Mois : `Janv. 26`, `Févr. 26`, `Mars 26`, `Avr. 26`, `Mai 26`, `Juin 26`, `Juil. 26`, `Août 26`, `Sept. 26`, `Oct. 26`, `Nov. 26`, `Déc. 26` sur les axes ; `Janv. 2026` dans les tableaux et les phrases.
- Dates : `jj/mm/aaaa`.
- Tout le texte est en français correct, avec accents et majuscules.

## 1.5 Composants récurrents

**En-tête (pages 2 à 6)**
- Logo Hertz Bénin à x = 15 mm, taille 18,2 × 11,2 mm, bord supérieur à 12,8 mm.
- En haut à droite (aligné à droite sur x = 195 mm) : « Bilan statistique du parc automobile » (Medium 7,5 pt, gris) à 13,2 mm, puis « Période du jj/mm/aaaa au jj/mm/aaaa » (Regular 7 pt, gris) à 17,6 mm.
- Trait de marque sous l'en-tête : barre jaune de 52 × 1,5 mm (de x = 15 mm, bord haut à 26,3 mm) prolongée par un filet gris `#DCDCD6` de 0,6 pt jusqu'à x = 195 mm, à 27,05 mm.
- Titre de page : ligne de base à 38 mm. Sous-titre : ligne de base à 44 mm.

**Titre de section** : petit carré jaune de 2,6 × 3,4 mm, puis le titre à 4,6 mm à droite du carré, ligne de base alignée sur le bas du carré (carré centré sur la hauteur du texte).

**Pied de page (toutes les pages)**
- Filet gris à 282 mm du haut (15 mm du bas).
- À gauche, ligne de base à 285 mm : « Hertz Bénin · Bilan statistique du parc » (Regular 6,8 pt, gris).
- À droite : « Page n / 6 » (Medium 6,8 pt, gris).
- **Uniquement en mode démonstration**, au centre : étiquette jaune arrondie de 48 × 4,8 mm avec « EXEMPLE : DONNÉES FICTIVES » (Bold 6,3 pt, `#222222`).

**Carte indicateur** (page 1) : 56,67 × 29 mm, fond `#F4F4F1`, bande jaune de 2,2 mm sur le bord gauche. De haut en bas : libellé en majuscules, valeur en gros, puis une ligne de variation : petit triangle + « +5,2 % vs période précédente » (Medium 6,8 pt). Triangle plein `#222222` vers le haut si hausse ; triangle jaune à contour `#222222` vers le bas si baisse ; petit trait gris si variation nulle. Les taux se comparent en **points** (« pts »), les autres valeurs en **pourcentage**.

**Tableau** : en-tête `#222222` (texte blanc SemiBold), lignes alternées blanc / `#F7F7F4`, filets `#DCDCD6` de 0,3 pt, hauteur de ligne 5,6 mm (en-tête 6,4 mm), marges internes 2,2 mm. Texte à gauche pour les libellés, **à droite pour tous les nombres**. **Ligne de total** : fond jaune `#FFCC00`, texte Bold, filet supérieur `#222222` de 0,8 pt. La hauteur de ligne se réduit automatiquement (minimum 3,9 mm, police 6,6 pt) quand il y a plus de 10 mois, pour que le tableau ne touche jamais le pied de page.

**Puces** : carré jaune de 1,8 mm, texte à 4,6 mm à droite, espacement vertical 2,6 mm.

## 1.6 Style commun des graphiques (matplotlib, Montserrat)

- Fond blanc. Pas de cadre. Axes haut et droit supprimés. Axes gauche et bas en `#DCDCD6`. Pas de repères sur les axes.
- Grille horizontale uniquement, `#E8E8E3`, 0,7 pt, derrière les données.
- Graduations en 7 pt gris. Étiquettes de valeurs en 7 pt SemiBold `#222222`.
- Barres : jaune `#FFCC00`, largeur 0,62 (verticales) ; barres horizontales hauteur 0,62.
- Courbes : `#222222`, trait 1,6 à 1,8 pt, marqueurs ronds 3,5 à 4 pt.
- Aires : jaune à 55 % d'opacité.
- Dans un classement, la **première barre est en `#222222`**, les autres en jaune.
- Légendes sans cadre, 7 pt.
- Aucun dégradé, ombre, effet 3D, ni camembert. Le seul graphique circulaire autorisé est l'**anneau** (épaisseur 0,36, liseré blanc de 2,5 pt).

## 1.7 Mise en page, page par page

**Page 1 : synthèse (pas d'en-tête standard)**
- Logo 40 × 24,7 mm en haut à gauche (bord haut à 8,3 mm). En haut à droite : « Édité le jj/mm/aaaa » (Medium 7,5 pt) et « Par : … » (Regular 7,5 pt).
- **Bandeau jaune pleine largeur** (de x = 0 à 210 mm) de 36 mm de haut, de 42 à 78 mm. Titre en 2 lignes : « Bilan statistique » (ligne de base 56 mm) et « du parc automobile » (66 mm), Bold 25 pt `#222222`. Sous-titre à 74 mm : « Chiffre d'affaires · Taux d'utilisation · Taux de rotation » (Medium 9,5 pt).
- Ligne d'informations à 89 mm (libellés en majuscules SemiBold 6 pt gris) et 94,5 mm (valeurs SemiBold 8,6 pt), en 4 colonnes à x = 15, 62, 125, 163 mm : Période / Périmètre / Véhicules suivis (moyenne) / Mois couverts. Filet gris à 99 mm.
- Section « Indicateurs clés de la période » à 106 mm. **6 cartes** en grille 3 × 2 (espacement 5 mm), première rangée à 113 mm, deuxième à 147 mm. Ordre : Chiffre d'affaires, Locations, Jours loués ; Taux d'utilisation, Taux de rotation, Taux d'immobilisation.
- Section « Lecture rapide » à 187 mm : 5 puces (voir Temps 2).
- En mode démonstration uniquement : encadré à bord jaune (1,4 pt, fond `#FFFBE6`, 14 mm de haut, à partir de 250 mm) : « Document d'exemple. Les chiffres, véhicules et noms de ce modèle sont fictifs : ils servent uniquement à valider la mise en page. En production, toutes les données proviennent de la base de gestion des locations. »

**Page 2 : Chiffre d'affaires**
- Titre « Chiffre d'affaires », sous-titre « Évolution mensuelle, répartition et détail par mois ».
- Section 52 mm « Évolution du chiffre d'affaires » : graphique 180 × 66 mm à 58 mm.
- Sections à 130 mm : « Répartition par type de location » (anneau 70 × 56 mm à x = 15, y = 136 mm) et « Chiffre d'affaires par catégorie de véhicule » (barres horizontales 95 × 56 mm à x = 100 mm).
- Section 197 mm « Détail mensuel » : tableau à 204 mm, colonnes (mm) 22 / 18 / 20 / 28 / 26 / 28 / 22 / 16 = 180.
- Note à 276,5 mm (Regular 6,4 pt, gris) : « Montants en F CFA. Le CA est rattaché au mois de la date de début de chaque location. Évol. = variation par rapport au mois précédent. »

**Page 3 : Détail du chiffre d'affaires** (« Par véhicule et par commercial »)
- Section 52 mm « Les 10 véhicules les plus rentables » : graphique 180 × 66 mm à 57 mm ; tableau à 127 mm (colonnes 52 / 34 / 18 / 22 / 32 / 22, lignes de 5,1 mm, police 6,9 pt).
- Section 190 mm « Chiffre d'affaires par commercial » : graphique 100 × 58 mm à x = 15, y = 196 mm ; tableau à x = 130, y = 198 mm (colonnes 28 / 18 / 19).
- Paragraphe « Lecture. » à 259 mm (Regular 7,2 pt, gris, largeur 180 mm).

**Page 4 : Utilisation et immobilisation de la flotte**
- Sous-titre : « Part des jours où les véhicules sont loués, disponibles ou immobilisés ».
- Section 52 mm « Taux d'utilisation mensuel » : courbe 180 × 60 mm à 58 mm.
- Section 124 mm : « Répartition des jours-véhicules » (barres empilées 88 × 60 mm à x = 15) et « Utilisation par catégorie » (barres horizontales 88 × 56 mm à x = 107).
- Section 200 mm : « Les 5 véhicules les plus utilisés » (x = 15) et « Les 5 véhicules les moins utilisés » (x = 107), tableaux à 207 mm, colonnes 40 / 16 / 13 / 19, police 6,9 pt.
- Note à 252 mm : « Un véhicule peu utilisé n'est pas toujours un mauvais véhicule : vérifiez d'abord s'il a été immobilisé (garage, sinistre) avant de décider d'une cession. »

**Page 5 : Rotation du parc** (« Nombre de locations par véhicule et durée moyenne des locations »)
- Section 52 mm « Taux de rotation mensuel » : graphique 180 × 62 mm à 58 mm.
- Section 126 mm : « Locations par véhicule » (histogramme 88 × 56 mm à x = 15) et « Durée moyenne d'une location » (courbe 88 × 56 mm à x = 107).
- Section 196 mm « Tableau de bord mensuel » : tableau à 203 mm, colonnes 24 / 28 / 24 / 22 / 26 / 28 / 28.

**Page 6 : Définitions et méthode**
- Section « Indicateurs » : tableau 3 colonnes (38 / 58 / 84 mm) Indicateur / Formule / Précisions, 8 lignes (voir 2.2), texte en 7,2 pt avec le nom de l'indicateur en gras.
- Section « Points d'attention » : 3 puces.
- Section « Commentaires et validation » : 4 lignes de saisie (filets gris) puis deux cadres de 87 × 30 mm, « ÉTABLI PAR » et « VALIDÉ PAR », avec bandeau jaune de 6,2 mm contenant le titre en Bold 7 pt, puis « Nom : », « Date : », « Signature : ».

## 1.8 Interdits

Autre police ou autre couleur que celles listées ; texte jaune sur fond blanc ; dégradés, ombres, effets 3D, camemberts ; logo étiré ou recolorié ; chiffres inventés hors mode démonstration ; texte coupé ou débordant ; tableau qui touche le pied de page ; mélange d'espaces normales et insécables dans les nombres.

## 1.9 Critères d'acceptation du Temps 1 (à remplir avant de passer au Temps 2)

Génère le PDF en **mode démonstration** avec les données fictives de l'implémentation de référence, puis réponds point par point (OK / écart + correction) :

1. Le PDF compte 6 pages A4 et les titres de pages correspondent au 1.7.
2. `pdffonts` ne liste que des Montserrat intégrées.
3. Toutes les couleurs sont dans la palette du 1.2 (aucune autre).
4. L'en-tête, le pied de page, les titres de section, les cartes et les tableaux sont identiques au modèle (positions à ± 1 mm).
5. Les 11 graphiques ont les tailles du 1.7 et le style du 1.6 (première barre sombre dans les classements, aucun camembert).
6. Aucun texte ne déborde ni ne se chevauche ; aucun tableau ne touche le pied de page.
7. Les formats de nombres respectent le 1.4 (espaces insécables, virgules, signe moins).
8. L'étiquette et l'encadré « exemple » n'apparaissent **qu'en mode démonstration**.
9. Une comparaison visuelle page par page avec le PDF modèle (rendu à 70 dpi) ne montre aucune différence de mise en page.

**ARRÊTE-TOI ICI et attends ma validation.**

---

# TEMPS 2 : RESPECTER LA PRÉSENTATION ET LE CALCUL DES RAPPORTS STATISTIQUES

## 2.1 Principes généraux

- **Période** : choisie par l'utilisateur (`debut`, `fin`). Recommandation et limite d'affichage : 12 mois. Au-delà, afficher l'avertissement « plus de 12 mois sélectionnés ; les tableaux mensuels seront très serrés ».
- **Périmètre** : par défaut la **flotte de location courte durée** (`segment_parc = 'LCD'`). Les véhicules en LEASING et LLD n'ont pas de locations courte durée dans le journal : leurs taux seraient faussés. Le périmètre choisi est toujours affiché sur la page 1.
- **Période précédente** : la période de **même durée** qui précède immédiatement. Elle sert aux variations des cartes de la page 1. S'il n'y a aucune donnée sur cette période, **aucune variation n'est affichée** (la carte garde seulement son sous-texte).
- **Mois en cours** : calculé jusqu'à la date d'édition. Les taux d'un mois partiel utilisent le nombre de jours réellement observés.
- **Source unique de vérité** : la base. Aucun chiffre n'est recalculé différemment d'une page à l'autre.

## 2.2 Définitions et sources (page 6 du PDF)

| Indicateur | Formule | Source dans la base |
|---|---|---|
| **Chiffre d'affaires** | Somme de `location.montant_total` (prolongations et suppléments inclus), rattachée au **mois de `date_debut`** | Requête sur `location` filtrée par segment ; `v_ca_mensuel`, `sp_kpi_chiffre_affaires` |
| **Jour loué** | Jour calendaire sous contrat : départ **inclus**, retour **exclu**, minimum 1 jour par location | `location.duree_jours`, `v_jours_loues_vehicule_mensuel` |
| **Jours-véhicules du parc** | Somme, pour chaque jour, des véhicules présents (de `date_entree_parc` à `date_sortie_parc`) ; entrée inconnue = présent depuis le début de la période | `sp_kpi_flotte` (colonne `jours_vehicules_parc`) |
| **Taux d'utilisation** | Jours loués ÷ jours-véhicules du parc × 100 | `sp_kpi_flotte`, `v_kpi_flotte_mensuel` |
| **Taux de rotation** | Locations démarrées ÷ nombre moyen de véhicules du parc (nombre moyen = jours-véhicules ÷ jours observés) | `sp_kpi_flotte` |
| **Taux d'immobilisation** | Jours d'immobilisation (garage ou sinistre immobilisant, chevauchements comptés **une seule fois**) ÷ jours-véhicules × 100 | `sp_kpi_flotte` |
| **Durée moyenne** | Jours loués ÷ nombre de locations | calculé |
| **Panier moyen** | Chiffre d'affaires ÷ nombre de locations | calculé |

Les taux de la période entière se calculent **sur les totaux** (somme des jours loués ÷ somme des jours-véhicules), **jamais en faisant la moyenne des taux mensuels**.

## 2.3 Présentation de chaque rapport

### Rapport 1 : Synthèse (page 1)

- **6 cartes** dans l'ordre fixé au 1.7. Valeurs : CA en `M F CFA` (1 décimale) ; locations et jours loués en entiers ; taux d'utilisation et d'immobilisation en `%` (1 décimale) ; taux de rotation en `loc./véh.` (2 décimales).
- Sous-textes : « CA total », « contrats démarrés », « jours-véhicules », « jours loués / jours disponibles du parc », « locations par véhicule », « jours perdus en garage ou sinistre ».
- Variations : en `%` pour le CA, les locations, les jours loués et la rotation ; en `pts` pour l'utilisation et l'immobilisation.

### Rapport 2 : Chiffre d'affaires (pages 2 et 3)

1. **CA mensuel** : barres jaunes en millions de F CFA, valeur (1 décimale) au-dessus de chaque barre ; courbe `#222222` du **CA cumulé** sur l'axe de droite ; légende en haut à gauche.
2. **Anneau courte / longue durée** : total au centre (« 468,8 M », puis « F CFA au total ») ; légende « Courte durée : 92,9 % », « Longue durée : 7,1 % ».
3. **CA par catégorie** : barres horizontales triées du plus grand au plus petit, valeur en `M` (1 décimale). Catégorie vide = « Non classé ».
4. **Tableau mensuel** : Mois, Locations, Jours loués, CA courte durée, CA longue durée, CA total, Panier moyen, Évol. (variation en % par rapport au mois précédent, **0 décimale**, vide pour le premier mois). Ligne **Total** en jaune ; son Évol. reste vide.
5. **Top 10 véhicules** : barres horizontales en `M` (2 décimales), étiquette « plaque · modèle » ; tableau Véhicule, Catégorie, Locations, Jours loués, CA (F CFA), Utilisation.
6. **CA par commercial** : barres horizontales (8 maximum), tableau Commercial, Locations, Part du CA (1 décimale).
7. Paragraphe « Lecture. » : part des 3 premiers commerciaux, CA moyen par location.

### Rapport 3 : Utilisation et immobilisation (page 4)

1. **Courbe du taux d'utilisation mensuel** : ligne `#222222` avec marqueurs, aire jaune, valeur en `%` (0 décimale) au-dessus de chaque point, axe de 0 à 100 %. **Ligne d'objectif en pointillés gris, uniquement si un objectif est renseigné**, libellée « Objectif 65 % » à gauche, sans masquer de valeur.
2. **Barres empilées à 100 %** par mois : « Loués » (jaune), « Immobilisés » (`#222222`), « Disponibles non loués » (`#DCDCD6`). La somme fait toujours 100 %.
3. **Utilisation par catégorie** : barres horizontales de 0 à 100 %, jours loués ÷ jours-véhicules de la catégorie.
4. **Deux tableaux** : les 5 véhicules les plus et les moins utilisés (véhicules ayant au moins 1 jour de présence au parc), colonnes Véhicule, Locations, Jours, Taux.

### Rapport 4 : Rotation (page 5)

1. **Graphique de rotation** : barres jaunes = locations par véhicule (2 décimales), **courbe `#222222` du nombre de locations placée au-dessus des barres sans les recouvrir**, avec ses valeurs ; pas d'axe de droite.
2. **Histogramme « Locations par véhicule »** : au plus 7 classes, nombre de véhicules au-dessus de chaque barre, axes titrés « Nombre de locations sur la période » et « Nombre de véhicules ».
3. **Durée moyenne d'une location** : courbe avec aire jaune, 1 décimale.
4. **Tableau de bord mensuel** : Mois, Véhicules (moy.), Locations, Rotation, Durée moy. (j), Utilisation, Immobilisation ; ligne finale **Période** en jaune.

### Rapport 5 : Définitions (page 6)

Reprend le tableau du 2.2 sans modification de sens, puis les 3 points d'attention :
- les taux d'utilisation et de rotation ne s'interprètent que sur la flotte de location courte durée ;
- le mois en cours est calculé jusqu'à la date d'édition ;
- les chiffres reposent sur les saisies de la base (location non enregistrée ou retour non daté = indicateurs faussés).

## 2.4 « Lecture rapide » : phrases générées (page 1)

Les 5 puces sont produites par modèle, avec les valeurs réelles, sans jamais changer la structure :

1. **Chiffre d'affaires :** `{CA} F CFA sur la période, soit {+/−x,x %} par rapport à la période précédente. Meilleur mois : {Mois AAAA} ({CA du mois} M F CFA).` (la partie « par rapport à la période précédente » est omise si elle n'existe pas)
2. **Utilisation :** `{taux} % des jours disponibles du parc ont été loués. Pic en {Mois} ({x} %), creux en {Mois} ({x} %).`
3. **Rotation :** `{x,xx} locations par véhicule, pour une durée moyenne de {x,x} jours par location.`
4. **Immobilisation :** `{taux} % des jours-véhicules sont perdus ({n} jours), un manque à gagner à surveiller en priorité.`
5. **Concentration :** `les 10 véhicules les plus rentables réalisent {x} % du chiffre d'affaires.`

Le libellé en gras précède chaque phrase. Aucune phrase ne contient d'appréciation non fondée sur les chiffres.

## 2.5 Cas limites (comportement obligatoire)

| Cas | Comportement |
|---|---|
| Dénominateur nul (aucun véhicule, aucune location) | Afficher `0` ou « n.d. » selon la colonne, **jamais d'erreur ni de `NaN`/`inf`** |
| Aucune donnée sur toute la période | Générer un PDF valide avec des valeurs à zéro et la mention « Aucune location enregistrée sur la période » en page 1 |
| Un seul mois | Les graphiques et tableaux restent lisibles ; la colonne Évol. est vide |
| Véhicule sans catégorie | « Non classé » |
| Véhicule sans date d'entrée au parc | Compté présent dès le début de la période |
| Véhicule vendu en cours de période | Compté jusqu'à sa date de sortie seulement |
| Libellé trop long dans un graphique | Tronqué à 38 caractères suivis de « … » |
| Période sans mois complet | Le nombre de jours observés remplace le nombre de jours du mois dans le calcul du nombre moyen de véhicules |
| Segment sans véhicule | Message explicite, pas de PDF vide trompeur |

## 2.6 Contrôles de cohérence (à exécuter à chaque génération)

1. La somme des CA mensuels = le CA total des cartes = la ligne Total du tableau = la somme des CA par commercial = la somme des CA par catégorie.
2. La somme des locations mensuelles = le total des cartes = la somme des locations par véhicule.
3. Les jours loués du tableau de bord mensuel s'additionnent exactement au total de la carte « Jours loués ».
4. Pour chaque mois : utilisation + immobilisation ≤ 100 %.
5. Le taux de la période entière est recalculé sur les totaux et correspond à la ligne « Période » du tableau.
6. Les chiffres du PDF sont **égaux** à ceux d'une requête SQL directe de contrôle. En cas d'écart, la génération échoue avec un message clair au lieu de produire un PDF faux.

## 2.7 Modes de génération

- **Mode démonstration** (`--demo`) : données fictives cohérentes (CA = jours loués × tarif). Étiquette et encadré « exemple » **obligatoires** sur le document.
- **Mode réel** : données lues dans la base, avec un compte de lecture dédié (`SELECT`, `EXECUTE`, `CREATE TEMPORARY TABLES`). Aucune mention « exemple ».
- Paramètres : `debut`, `fin`, `segment`, `objectif d'utilisation` (facultatif), `edite par`, `perimetre` (libellé facultatif).

## 2.8 Critères d'acceptation du Temps 2

1. Les 5 rapports se présentent comme décrit en 2.3, dans le même ordre et avec les mêmes colonnes.
2. Les définitions du 2.2 sont appliquées à l'identique dans le code **et** affichées en page 6.
3. Le test de cohérence du 2.6 passe sur 3 périodes : 1 mois, 9 mois, 12 mois.
4. Le mode réel donne les mêmes chiffres qu'une requête SQL directe (donne les deux résultats côte à côte).
5. Les cas limites du 2.5 sont testés : période vide, segment sans véhicule, un seul mois, 12 mois.
6. Le PDF réel et le PDF de démonstration ont **exactement** le même design.

---

# LIVRABLES ET FORMAT DE RÉPONSE

**À chaque temps, réponds dans cet ordre :**
1. **Plan** : 5 lignes maximum sur ce que tu vas faire.
2. **Hypothèses** : liste numérotée de tout ce que tu as dû supposer.
3. **Code** : fichiers complets, commentés en français, prêts à exécuter.
4. **Tests** : commandes exécutées et leur résultat réel (pas de résultat inventé).
5. **Liste de contrôle remplie** (1.9 pour le Temps 1, 2.8 pour le Temps 2), avec OK ou écart + correction.
6. **Limites connues** : ce qui reste à confirmer de mon côté.

**Livrables attendus à la fin du Temps 2 :**
- le module de génération (fonction appelable depuis l'application, pas seulement en ligne de commande) ;
- le PDF de démonstration et un PDF réel d'exemple ;
- les tests automatisés des contrôles du 2.6 ;
- un court mode d'emploi (installation, paramètres, compte de lecture à créer).

**Règle d'honnêteté** : si une exigence ne peut pas être respectée, tu le dis explicitement avec la raison et une alternative. Tu n'affirmes jamais qu'un test a réussi sans l'avoir exécuté.

# FIN DU PROMPT
