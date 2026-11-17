import { useEffect, useMemo, useState } from "react"

import type { FormEvent } from "react"

import { useOutletContext } from "react-router-dom"

import { apiFetch } from "@/shared/api/client"

import DetailModal from "@/shared/components/DetailModal"

import Icon from "@/shared/components/Icon"

import { notifyDashboardMutation } from "@/shared/components/dashboardNotifications"

import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"

import type { DashboardOutletContext } from "../DashboardLayout"

interface SubLocationVehicle {
  id: number

  immatriculation: string

  marque?: string | null

  modele?: string | null

  version?: string | null

  annee?: number | null

  numeroChassis?: string | null

  couleur?: string | null

  carburant?: string | null

  nbPlaces?: number | null

  kilometrage: number

  segmentParc?: string

  groupeGeolocalisation?: string | null

  centreId?: number | null

  centre?: string | null

  dateMiseEnService?: string | null

  dateEntreeParc?: string | null

  dateSortieParc?: string | null

  prixAchat?: number | null

  dateAchat?: string | null

  prixVente?: number | null

  statut: string

  dateProchaineVisiteTechnique?: string | null

  dateExpirationAssurance?: string | null

  observation?: string | null

  categorieId?: number | null

  categorie?: string | null
}

interface ModelOption {
  id: number

  marque: string

  nom: string
}

interface NamedOption {
  id: number

  nom: string
}

interface CategoryOption {
  id: number

  libelle: string
}

interface VehicleForm {
  immatriculation: string

  modelKey: string

  version: string

  annee: string

  numeroChassis: string

  couleur: string

  carburant: string

  nbPlaces: string

  kilometrage: string

  segmentParc: string

  groupeGeolocalisation: string

  centreId: string

  categorieId: string

  dateMiseEnService: string

  dateEntreeParc: string

  dateSortieParc: string

  prixAchat: string

  dateAchat: string

  prixVente: string

  dateProchaineVisiteTechnique: string

  dateExpirationAssurance: string

  observation: string
}

const emptyForm: VehicleForm = {
  immatriculation: "",

  modelKey: "",

  version: "",

  annee: "",

  numeroChassis: "",

  couleur: "",

  carburant: "",

  nbPlaces: "",

  kilometrage: "0",

  segmentParc: "LCD",

  groupeGeolocalisation: "",

  centreId: "",

  categorieId: "",

  dateMiseEnService: "",

  dateEntreeParc: "",

  dateSortieParc: "",

  prixAchat: "",

  dateAchat: "",

  prixVente: "",

  dateProchaineVisiteTechnique: "",

  dateExpirationAssurance: "",

  observation: "",
}

const modelKey = (
  marque?: string | null,

  modele?: string | null,
) => (marque && modele ? `${marque}::${modele}` : "")

function nullableString(value: string): string | null {
  return value.trim() || null
}

function nullableNumber(value: string): number | null {
  return value.trim() ? Number(value) : null
}

function vehicleForm(vehicle: SubLocationVehicle): VehicleForm {
  return {
    immatriculation: vehicle.immatriculation,

    modelKey: modelKey(vehicle.marque, vehicle.modele),

    version: vehicle.version ?? "",

    annee: vehicle.annee?.toString() ?? "",

    numeroChassis: vehicle.numeroChassis ?? "",

    couleur: vehicle.couleur ?? "",

    carburant: vehicle.carburant ?? "",

    nbPlaces: vehicle.nbPlaces?.toString() ?? "",

    kilometrage: vehicle.kilometrage.toString(),

    segmentParc: vehicle.segmentParc ?? "LCD",

    groupeGeolocalisation: vehicle.groupeGeolocalisation ?? "",

    centreId: vehicle.centreId?.toString() ?? "",

    categorieId: vehicle.categorieId?.toString() ?? "",

    dateMiseEnService: vehicle.dateMiseEnService?.slice(0, 10) ?? "",

    dateEntreeParc: vehicle.dateEntreeParc?.slice(0, 10) ?? "",

    dateSortieParc: vehicle.dateSortieParc?.slice(0, 10) ?? "",

    prixAchat: vehicle.prixAchat?.toString() ?? "",

    dateAchat: vehicle.dateAchat?.slice(0, 10) ?? "",

    prixVente: vehicle.prixVente?.toString() ?? "",

    dateProchaineVisiteTechnique:
      vehicle.dateProchaineVisiteTechnique?.slice(0, 10) ?? "",

    dateExpirationAssurance:
      vehicle.dateExpirationAssurance?.slice(0, 10) ?? "",

    observation: vehicle.observation ?? "",
  }
}

export default function SousLocationVehiclesPage() {
  const { query, pageTitle, pageDate, pageSubtitle } =
    useOutletContext<DashboardOutletContext>()

  const [rows, setRows] = useState<SubLocationVehicle[]>([])

  const [models, setModels] = useState<ModelOption[]>([])

  const [categories, setCategories] = useState<CategoryOption[]>([])

  const [centres, setCentres] = useState<NamedOption[]>([])

  const [form, setForm] = useState<VehicleForm | null>(null)

  const [editing, setEditing] = useState<SubLocationVehicle | null>(null)

  const [deleting, setDeleting] = useState<SubLocationVehicle | null>(null)

  const [detail, setDetail] = useState<SubLocationVehicle | null>(null)

  const [search, setSearch] = useState("")

  const [statusFilter, setStatusFilter] = useState("")

  const [page, setPage] = useState(1)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const [vehicles, modelRows, categoryRows, centreRows] = await Promise.all(
        [
          apiFetch<SubLocationVehicle[]>("/api/sous-locations/vehicules"),

          apiFetch<ModelOption[]>("/api/parc/modeles"),

          apiFetch<CategoryOption[]>("/api/parc/categories"),

          apiFetch<NamedOption[]>("/api/parc/centres"),
        ],
      )

      setRows(vehicles)

      setModels(modelRows)

      setCategories(categoryRows)

      setCentres(centreRows)

      setError(null)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible")
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const needle = `${query} ${search}`.trim().toLowerCase()

    return rows.filter(
      (vehicle) =>
        (!statusFilter || vehicle.statut === statusFilter) &&
        (!needle ||
          `${vehicle.immatriculation} ${vehicle.marque ?? ""} ${vehicle.modele ?? ""} ${vehicle.statut}`

            .toLowerCase()

            .includes(needle)),
    )
  }, [rows, query, search, statusFilter])

  const visibleRows = filtered.slice(
    (page - 1) * TABLE_PAGE_SIZE,

    page * TABLE_PAGE_SIZE,
  )

  useEffect(() => {
    setPage(1)
  }, [query, search, statusFilter])

  useEffect(() => {
    if (page > Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE))) {
      setPage(1)
    }
  }, [page, filtered.length])

  const open = (vehicle?: SubLocationVehicle) => {
    setEditing(vehicle ?? null)

    setForm(vehicle ? vehicleForm(vehicle) : { ...emptyForm })

    setError(null)
  }

  const set = (key: keyof VehicleForm, value: string) => {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!form) return

    const selectedModel = models.find(
      (model) => modelKey(model.marque, model.nom) === form.modelKey,
    )

    if (form.modelKey && !selectedModel) {
      setError("Sélectionnez un modèle dans le référentiel.")

      return
    }

    setSaving(true)

    setError(null)

    const payload = {
      immatriculation: form.immatriculation.trim(),

      marque: selectedModel?.marque ?? null,

      modele: selectedModel?.nom ?? null,

      version: nullableString(form.version),

      annee: nullableNumber(form.annee),

      numeroChassis: nullableString(form.numeroChassis),

      couleur: nullableString(form.couleur),

      carburant: form.carburant || null,

      nbPlaces: nullableNumber(form.nbPlaces),

      kilometrage: Number(form.kilometrage || 0),

      segmentParc: form.segmentParc,

      groupeGeolocalisation: nullableString(form.groupeGeolocalisation),

      centreId: nullableNumber(form.centreId),

      categorieId: nullableNumber(form.categorieId),

      dateMiseEnService: nullableString(form.dateMiseEnService),

      dateEntreeParc: nullableString(form.dateEntreeParc),

      dateSortieParc: nullableString(form.dateSortieParc),

      prixAchat: nullableNumber(form.prixAchat),

      dateAchat: nullableString(form.dateAchat),

      prixVente: nullableNumber(form.prixVente),

      dateProchaineVisiteTechnique: nullableString(
        form.dateProchaineVisiteTechnique,
      ),

      dateExpirationAssurance: nullableString(form.dateExpirationAssurance),

      observation: nullableString(form.observation),
    }

    try {
      await apiFetch(
        editing
          ? `/api/sous-locations/vehicules/${editing.id}`
          : "/api/sous-locations/vehicules",

        {
          method: editing ? "PUT" : "POST",

          body: payload,
        },
      )

      setForm(null)

      setEditing(null)

      await load()

      notifyDashboardMutation(
        editing
          ? "Véhicule de sous-location modifié."
          : "Véhicule de sous-location ajouté.",
      )
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Enregistrement impossible",
      )
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!deleting) return

    setError(null)

    try {
      await apiFetch(`/api/sous-locations/vehicules/${deleting.id}`, {
        method: "DELETE",
      })

      setDeleting(null)

      await load()

      notifyDashboardMutation("Véhicule de sous-location supprimé.")
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Suppression impossible",
      )

      setDeleting(null)
    }
  }

  const textField = (
    key: keyof VehicleForm,

    label: string,

    type = "text",

    required = false,
  ) => (
    <label key={key}>
      <span>{label}</span>
      <input
        type={type}
        value={form?.[key] ?? ""}
        required={required}
        min={type === "number" ? 0 : undefined}
        onChange={(event) => set(key, event.target.value)}
      />
    </label>
  )

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="kicker">HERTZ BÉNIN · {pageDate}</p>
          <h1>{pageTitle}</h1>
          <p>{pageSubtitle}</p>
        </div>
      </div>
      <section className="data-card">
        <div className="data-toolbar">
          <div>
            <h2>Véhicules de sous-location</h2>
            <p>{filtered.length} véhicule(s)</p>
          </div>
          <div>
            <input
              className="table-search"
              placeholder="Rechercher un véhicule…"
              aria-label="Rechercher un véhicule de sous-location"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="secondary status-filter"
              aria-label="Filtrer par situation"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Toutes les situations</option>
              <option value="ENTREE_PARC">Disponible</option>
              <option value="MISE_EN_LOCATION">En location</option>
              <option value="RETOUR_LOCATION">Location terminée</option>
            </select>
            <button className="primary small" onClick={() => open()}>
              <Icon name="plus" size={17} /> Ajouter
            </button>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Immatriculation</th>
                <th>Véhicule</th>
                <th>Catégorie</th>
                <th>Centre</th>
                <th>Kilométrage</th>
                <th>Situation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td>
                    <strong>{vehicle.immatriculation}</strong>
                  </td>
                  <td>
                    {[vehicle.marque, vehicle.modele, vehicle.version]

                      .filter(Boolean)

                      .join(" ") || "À compléter"}
                  </td>
                  <td>
                    {vehicle.categorie ??
                      categories.find(
                        (category) => category.id === vehicle.categorieId,
                      )?.libelle ??
                      "—"}
                  </td>
                  <td>
                    {vehicle.centre ??
                      centres.find((centre) => centre.id === vehicle.centreId)
                        ?.nom ??
                      "—"}
                  </td>
                  <td>{vehicle.kilometrage.toLocaleString("fr-FR")} km</td>
                  <td>{vehicle.statut}</td>
                  <td className="actions">
                    <button
                      title="Voir les détails"
                      aria-label={`Voir ${vehicle.immatriculation}`}
                      onClick={() => setDetail(vehicle)}
                    >
                      <Icon name="eye" size={17} />
                    </button>
                    <button
                      className="action-edit"
                      title="Modifier"
                      aria-label={`Modifier ${vehicle.immatriculation}`}
                      onClick={() => open(vehicle)}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      className="action-delete"
                      title="Supprimer"
                      aria-label={`Supprimer ${vehicle.immatriculation}`}
                      onClick={() => setDeleting(vehicle)}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          total={filtered.length}
          onChange={setPage}
        />
      </section>

      {form && (
        <div className="modal-backdrop">
          <form
            className="modal sub-location-vehicle-modal"
            onSubmit={(event) => void save(event)}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Fermer"
              onClick={() => setForm(null)}
            >
              ×
            </button>
            <h2>{editing ? "Modifier le véhicule" : "Nouveau véhicule"}</h2>
            <p>Renseignements du véhicule de sous-location</p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-fields">
              {textField("immatriculation", "Immatriculation", "text", true)}
              <label>
                <span>Marque et modèle</span>
                <select
                  value={form.modelKey}
                  onChange={(event) => set("modelKey", event.target.value)}
                >
                  <option value="">Sélectionner un modèle</option>
                  {models.map((model) => (
                    <option
                      key={model.id}
                      value={modelKey(model.marque, model.nom)}
                    >
                      {model.marque} {model.nom}
                    </option>
                  ))}
                </select>
              </label>
              {textField("version", "Version")}
              {textField("annee", "Année", "number")}
              {textField("numeroChassis", "Numéro de châssis / VIN")}
              {textField("couleur", "Couleur")}
              <label>
                <span>Carburant</span>
                <select
                  value={form.carburant}
                  onChange={(event) => set("carburant", event.target.value)}
                >
                  <option value="">Non renseigné</option>
                  <option value="ESSENCE">Essence</option>
                  <option value="DIESEL">Diesel</option>
                  <option value="HYBRIDE">Hybride</option>
                  <option value="ELECTRIQUE">Électrique</option>
                </select>
              </label>
              {textField("nbPlaces", "Nombre de places", "number")}
              {textField("kilometrage", "Kilométrage", "number")}
              <label>
                <span>Segment</span>
                <select
                  value={form.segmentParc}
                  onChange={(event) => set("segmentParc", event.target.value)}
                >
                  <option value="LCD">LCD</option>
                  <option value="LLD">LLD</option>
                  <option value="LEASING">Leasing</option>
                  <option value="IMPRO">Impro</option>
                  <option value="AUTRE">Autre</option>
                </select>
              </label>
              <label>
                <span>Catégorie</span>
                <select
                  value={form.categorieId}
                  onChange={(event) => set("categorieId", event.target.value)}
                >
                  <option value="">Non renseignée</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.libelle}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Centre</span>
                <select
                  value={form.centreId}
                  onChange={(event) => set("centreId", event.target.value)}
                >
                  <option value="">Non renseigné</option>
                  {centres.map((centre) => (
                    <option key={centre.id} value={centre.id}>
                      {centre.nom}
                    </option>
                  ))}
                </select>
              </label>
              {textField("groupeGeolocalisation", "Groupe de géolocalisation")}
              {textField("dateMiseEnService", "Mise en service", "date")}
              {textField("dateEntreeParc", "Entrée dans le parc", "date")}
              {textField("dateSortieParc", "Sortie du parc", "date")}
              {textField("prixAchat", "Prix d'achat", "number")}
              {textField("dateAchat", "Date d'achat", "date")}
              {textField("prixVente", "Prix de vente", "number")}
              {textField(
                "dateProchaineVisiteTechnique",

                "Prochaine visite technique",

                "date",
              )}
              {textField(
                "dateExpirationAssurance",

                "Expiration de l'assurance",

                "date",
              )}
              <label>
                <span>Observation</span>
                <input
                  value={form.observation}
                  onChange={(event) => set("observation", event.target.value)}
                  maxLength={255}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setForm(null)}
              >
                Annuler
              </button>
              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Supprimer le véhicule ?</h2>
            <p>
              {deleting.immatriculation} sera supprimé si aucune sous-location
              ni aucun mouvement ne lui est rattaché.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button className="secondary" onClick={() => setDeleting(null)}>
                Annuler
              </button>
              <button className="primary" onClick={() => void remove()}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <DetailModal
          title={detail.immatriculation}
          subtitle={[detail.marque, detail.modele, detail.version]

            .filter(Boolean)

            .join(" ")}
          fields={[
            { label: "Catégorie", value: detail.categorie ?? "—" },

            { label: "Année", value: detail.annee?.toString() ?? "—" },

            { label: "VIN", value: detail.numeroChassis ?? "—" },

            { label: "Couleur", value: detail.couleur ?? "—" },

            { label: "Carburant", value: detail.carburant ?? "—" },

            {
              label: "Nombre de places",

              value: detail.nbPlaces?.toString() ?? "—",
            },

            {
              label: "Kilométrage",

              value: `${detail.kilometrage.toLocaleString("fr-FR")} km`,
            },

            { label: "Segment", value: detail.segmentParc ?? "—" },

            { label: "Centre", value: detail.centre ?? "—" },

            { label: "Situation", value: detail.statut },

            { label: "Observation", value: detail.observation ?? "—" },
          ]}
          close={() => setDetail(null)}
        />
      )}
    </>
  )
}
