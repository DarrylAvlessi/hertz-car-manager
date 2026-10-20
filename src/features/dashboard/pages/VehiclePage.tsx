import { useEffect, useMemo, useState } from "react"

import type { FormEvent } from "react"

import { useOutletContext } from "react-router-dom"

import Icon from "@/shared/components/Icon"

import DetailModal from "@/shared/components/DetailModal"

import { apiFetch } from "@/shared/api/client"

import type { DashboardOutletContext } from "../DashboardLayout"

import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"
import DatePeriodFilter, { matchesDatePeriod, type DatePeriod } from "../components/DatePeriodFilter"

interface Model {
  id: number
  marque: string
  nom: string
  categorieId: number | null
  categorie: string | null
}

interface Category {
  id: number
  libelle: string
}

interface Centre {
  id: number
  nom: string
}

interface ClientOption { id: number; nom: string }
interface CommercialOption { id: number; nom: string }

interface Vehicle {
  id: number
  immatriculation: string
  marque: string
  modele: string
  version: string | null

  categorieId: number | null
  kilometrage: number
  segmentParc: string
  statut: string

  dateEntreeParc: string | null
  prixAchat: number | null
  dateAchat: string | null
  numeroChassis: string | null
  carburant: string | null

  centreId: number | null
}

const vehicleStatuses = [
  "ENTREE_PARC",
  "MISE_EN_LOCATION",
  "RETOUR_LOCATION",
  "SORTIE_INTERNE",
  "RETOUR_INTERNE",
  "ENVOI_GARAGE",
  "RETOUR_GARAGE",
  "SORTIE_DEFINITIVE",
  "RESERVATION",
]
const deletableVehicleStatuses = new Set([
  "ENTREE_PARC",
  "RETOUR_LOCATION",
  "RETOUR_INTERNE",
  "RETOUR_GARAGE",
  "SORTIE_DEFINITIVE",
])
const saleMotives = ["RENOUVELLEMENT_PARC", "COUT_ENTRETIEN_ELEVE", "FIN_CONTRAT", "ACCIDENT", "BESOIN_TRESORERIE", "AUTRE"]
const saleConditions = ["BON", "MOYEN", "MAUVAIS", "ACCIDENTE", "EPAVE", "POUR_PIECES"]
const saleChannels = ["PARTICULIER", "GARAGE_PROFESSIONNEL", "ENCHERES", "CLIENT_LOCATION", "APPEL_OFFRES", "AUTRE"]
const vehicleColors = [
  { name: "Blanc", value: "#f7f7f5" },
  { name: "Noir", value: "#171717" },
  { name: "Gris clair", value: "#c9cacc" },
  { name: "Gris", value: "#85888d" },
  { name: "Anthracite", value: "#41454b" },
  { name: "Argent", value: "#aeb6bd" },
  { name: "Bleu", value: "#2563a6" },
  { name: "Bleu nuit", value: "#172b4d" },
  { name: "Bleu clair", value: "#78b7d4" },
  { name: "Rouge", value: "#c83232" },
  { name: "Bordeaux", value: "#702638" },
  { name: "Vert", value: "#3d7652" },
  { name: "Vert foncé", value: "#244b3a" },
  { name: "Jaune", value: "#f2c230" },
  { name: "Orange", value: "#e7792e" },
  { name: "Beige", value: "#d4c3a0" },
  { name: "Marron", value: "#73513d" },
  { name: "Champagne", value: "#c9b78e" },
  { name: "Violet", value: "#72508c" },
  { name: "Rose", value: "#d98fa5" },
]
const localDate = () => {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  return date.toISOString().slice(0, 10)
}

const emptyForm: Record<string, string> = {
  immatriculation: "",
  marque: "",
  modele: "",
  version: "",
  numeroChassis: "",
  annee: "",

  couleur: "",
  carburant: "",
  nbPlaces: "",
  kilometrage: "0",
  segmentParc: "LCD",

  groupeGeolocalisation: "",
  centreId: "",
  dateMiseEnService: "",
  dateEntreeParc: "",
  prixAchat: "",
  dateAchat: "",

  dateProchaineVisiteTechnique: "",
  dateExpirationAssurance: "",
  observation: "",
  categorieId: "",
}

export default function VehiclePage() {
  const { query } = useOutletContext<DashboardOutletContext>()

  const [rows, setRows] = useState<Vehicle[]>([])

  const [models, setModels] = useState<Model[]>([])

  const [categories, setCategories] = useState<Category[]>([])

  const [centres, setCentres] = useState<Centre[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [commercials, setCommercials] = useState<CommercialOption[]>([])

  const [form, setForm] = useState<Record<string, string> | null>(null)

  const [editing, setEditing] = useState<Vehicle | null>(null)

  const [deleting, setDeleting] = useState<Vehicle | null>(null)

  const [detail, setDetail] = useState<Vehicle | null>(null)

  const [statusVehicle, setStatusVehicle] = useState<Vehicle | null>(null)
  const [selling, setSelling] = useState<Vehicle | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState("")
  const [vehicleQuery, setVehicleQuery] = useState("")
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("all")

  const load = async () => {
    try {
      const [vehicles, modelRows, categoryRows, centreRows, clientRows, commercialRows] = await Promise.all(
        [
          apiFetch<Vehicle[]>("/api/vehicules"),

          apiFetch<Model[]>("/api/parc/modeles"),

          apiFetch<Category[]>("/api/parc/categories"),

          apiFetch<Centre[]>("/api/parc/centres"),
          apiFetch<ClientOption[]>("/api/clients"),
          apiFetch<CommercialOption[]>("/api/commerciaux"),
        ],
      )

      setRows(vehicles)
      setModels(modelRows)
      setCategories(categoryRows)
      setCentres(centreRows)
      setClients(clientRows)
      setCommercials(commercialRows)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chargement impossible")
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const needle = `${query} ${vehicleQuery}`.trim().toLowerCase()

    return rows.filter((vehicle) => {
      const matchesQuery =
        !needle ||
        `${vehicle.immatriculation} ${vehicle.marque} ${vehicle.modele} ${vehicle.statut}`
          .toLowerCase()
          .includes(needle)
      return matchesQuery && (!statusFilter || vehicle.statut === statusFilter) &&
        matchesDatePeriod(vehicle.dateAchat ?? vehicle.dateEntreeParc, datePeriod)
    })
  }, [rows, query, vehicleQuery, statusFilter, datePeriod])

  const visibleRows = filtered.slice(
    (page - 1) * TABLE_PAGE_SIZE,
    page * TABLE_PAGE_SIZE,
  )

  useEffect(() => {
    setPage(1)
  }, [query, vehicleQuery, statusFilter, datePeriod])

  useEffect(() => {
    if (page > Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE)))
      setPage(1)
  }, [page, filtered.length])

  const open = (vehicle?: Vehicle) => {
    if (!vehicle) {
      setEditing(null)
      setForm({ ...emptyForm })
      return
    }

    setEditing(vehicle)

    setForm({
      ...emptyForm,
      ...Object.fromEntries(
        Object.entries(vehicle).map(([key, value]) => [key, value ?? ""]),
      ),
    })
  }

  const remove = async () => {
    if (!deleting) return

    try {
      await apiFetch(`/api/vehicules/${deleting.id}`, { method: "DELETE" })
      setDeleting(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Suppression impossible")
      setDeleting(null)
    }
  }

  const selectedModels = models.filter((model) => model.marque === form?.marque)

  const set = (key: string, value: string) =>
    setForm((current) => (current ? { ...current, [key]: value } : current))

  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div>
          <h2>Gestion des véhicules</h2>
          <p>{filtered.length} éléments affichés</p>
        </div>
        <div>
          <input
            className="table-search"
            placeholder="Rechercher un véhicule…"
            aria-label="Rechercher un véhicule"
            value={vehicleQuery}
            onChange={(event) => setVehicleQuery(event.target.value)}
          />
          <select
            className="secondary status-filter"
            aria-label="Filtrer par statut"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Tous les statuts</option>
            {vehicleStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <DatePeriodFilter value={datePeriod} onChange={setDatePeriod} />
          <button className="primary small" onClick={() => open()}>
            <Icon name="plus" size={17} /> Ajouter
          </button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Immatriculation</th>
              <th>Véhicule</th>
              <th>Catégorie</th>
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
                  {vehicle.marque} {vehicle.modele}
                </td>
                <td>
                  {categories.find((c) => c.id === vehicle.categorieId)
                    ?.libelle ?? "—"}
                </td>
                <td>{vehicle.kilometrage.toLocaleString("fr-FR")} km</td>
                <td>{vehicle.statut}</td>
                <td className="actions">
                  {vehicle.statut !== "SORTIE_DEFINITIVE" && <>
                    <button className="action-status" title="Enregistrer une vente" aria-label={`Vendre ${vehicle.immatriculation}`} onClick={() => setSelling(vehicle)}><Icon name="check" size={16} /></button>
                    <button
                      className="action-status"
                      title="Changer le statut"
                      aria-label={`Changer le statut de ${vehicle.immatriculation}`}
                      onClick={() => setStatusVehicle(vehicle)}
                    >
                      <Icon name="refresh" size={17} />
                    </button>
                  </>}
                  <button
                    title="Voir les détails"
                    aria-label={`Voir les détails de ${vehicle.immatriculation}`}
                    onClick={() => setDetail(vehicle)}
                  >
                    <Icon name="eye" size={17} />
                  </button>
                  {vehicle.statut !== "SORTIE_DEFINITIVE" && (
                    <button
                      className="action-edit"
                      title="Modifier"
                      aria-label="Modifier"
                      onClick={() => open(vehicle)}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                  )}
                  <button
                    className="action-delete"
                    title={deletableVehicleStatuses.has(vehicle.statut)
                      ? "Supprimer"
                      : "Suppression interdite pour ce statut"}
                    aria-label="Supprimer"
                    disabled={!deletableVehicleStatuses.has(vehicle.statut)}
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
      <TablePagination page={page} total={filtered.length} onChange={setPage} />
      {form && (
        <VehicleModal
          form={form}
          set={set}
          models={selectedModels}
          allModels={models}
          categories={categories}
          centres={centres}
          editing={editing}
          close={() => setForm(null)}
          saved={async () => {
            setForm(null)
            await load()
          }}
        />
      )}
      {deleting && (
        <div className="modal-backdrop">
          <div className="modal">
            <p className="kicker">CONFIRMATION</p>
            <h2>Supprimer ce véhicule ?</h2>
            <p>
              La suppression de « {deleting.immatriculation} » est définitive.
              Elle sera refusée si des mouvements, locations, réservations,
              ventes ou autres données historiques font référence à ce véhicule.
            </p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setDeleting(null)}>
                Annuler
              </button>
              <button className="danger" onClick={() => void remove()}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
      {detail && (
        <DetailModal
          title={`${detail.marque} ${detail.modele}`}
          subtitle={`Véhicule · ${detail.immatriculation}`}
          fields={[
            { label: "Immatriculation", value: detail.immatriculation },

            { label: "Marque", value: detail.marque },

            { label: "Modèle", value: detail.modele },

            { label: "Version", value: detail.version ?? "—" },

            {
              label: "Catégorie",
              value:
                categories.find(
                  (category) => category.id === detail.categorieId,
                )?.libelle ?? "—",
            },

            {
              label: "Kilométrage",
              value: `${detail.kilometrage.toLocaleString("fr-FR")} km`,
            },

            { label: "Segment parc", value: detail.segmentParc },

            { label: "Situation", value: detail.statut },

            { label: "Numéro de châssis", value: detail.numeroChassis ?? "—" },

            { label: "Carburant", value: detail.carburant ?? "—" },

            {
              label: "Centre",
              value:
                centres.find((centre) => centre.id === detail.centreId)?.nom ??
                "—",
            },

            { label: "Entrée au parc", value: detail.dateEntreeParc ?? "—" },
            { label: "Prix d’achat", value: detail.prixAchat === null ? "—" : `${detail.prixAchat.toLocaleString("fr-FR")} FCFA` },
            { label: "Date d’achat", value: detail.dateAchat ?? "—" },
          ]}
          close={() => setDetail(null)}
        />
      )}
      {statusVehicle && (
        <StatusModal
          vehicle={statusVehicle}
          clients={clients}
          commercials={commercials}
          close={() => setStatusVehicle(null)}
          saved={async () => {
            setStatusVehicle(null)
            await load()
          }}
        />
      )}
      {selling && (
        <SaleModal
          vehicle={selling}
          clients={clients}
          commercials={commercials}
          close={() => setSelling(null)}
          saved={async () => {
            setSelling(null)
            await load()
          }}
        />
      )}
    </section>
  )
}

function StatusModal({
  vehicle,
  clients,
  commercials,
  close,
  saved,
}: {
  vehicle: Vehicle
  clients: ClientOption[]
  commercials: CommercialOption[]
  close: () => void
  saved: () => Promise<void>
}) {
  const [status, setStatus] = useState(vehicle.statut)
  const [observation, setObservation] = useState("")
  const [garageId, setGarageId] = useState("")
  const [locationType, setLocationType] = useState("Courte durée")
  const now = new Date()
  const defaultStart = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const defaultEnd = new Date(now.getTime() + 86400000 - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const [clientId, setClientId] = useState("")
  const [commercialId, setCommercialId] = useState("")
  const [dateDebut, setDateDebut] = useState(defaultStart)
  const [dateFin, setDateFin] = useState(defaultEnd)
  const [garages, setGarages] = useState<Array<{ id: number; nom: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    void apiFetch<Array<{ id: number; nom: string }>>("/api/parc/garages").then(setGarages).catch(() => undefined)
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/vehicules/${vehicle.id}/statut`, {
        method: "POST",
        body: {
          statut: status,
          observation: observation.trim() || undefined,
          garageId: status === "ENVOI_GARAGE" && garageId ? Number(garageId) : undefined,
          motif: status === "ENVOI_GARAGE" ? observation.trim() || null : undefined,
          typeLocation: status === "MISE_EN_LOCATION" ? locationType : undefined,
          clientId: status === "MISE_EN_LOCATION" ? Number(clientId) : undefined,
          commercialId: status === "MISE_EN_LOCATION" ? Number(commercialId) : undefined,
          dateDebut: status === "MISE_EN_LOCATION" ? dateDebut : undefined,
          dateFin: status === "MISE_EN_LOCATION" ? dateFin : undefined,
        },
      })
      await saved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Changement de statut impossible")
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <button className="modal-close" type="button" onClick={close} aria-label="Fermer">
          <Icon name="close" />
        </button>
        <p className="kicker">MOUVEMENT VÉHICULE</p>
        <h2>Changer le statut</h2>
        <p>
          {vehicle.immatriculation} · statut actuel : <strong>{vehicle.statut}</strong>
        </p>
        <div className="modal-fields">
          <label>
            <span>Nouveau statut</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)} required>
              {vehicleStatuses.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Observation</span>
            <input
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              placeholder="Motif du changement (facultatif)"
              maxLength={255}
            />
          </label>
          {status === "ENVOI_GARAGE" && (
            <label>
              <span>Garage</span>
              <select value={garageId} onChange={(event) => setGarageId(event.target.value)} required>
                <option value="">Sélectionner un garage</option>
                {garages.map((garage) => <option key={garage.id} value={garage.id}>{garage.nom}</option>)}
              </select>
            </label>
          )}
          {status === "MISE_EN_LOCATION" && (
            <>
              <label><span>Type de location</span><select value={locationType} onChange={(event) => setLocationType(event.target.value)} required><option value="Courte durée">Courte durée</option><option value="Longue durée">Longue durée</option></select></label>
              <label><span>Client</span><select value={clientId} onChange={(event) => setClientId(event.target.value)} required><option value="">Sélectionner un client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.nom}</option>)}</select></label>
              <label><span>Commercial responsable</span><select value={commercialId} onChange={(event) => setCommercialId(event.target.value)} required><option value="">Sélectionner un commercial</option>{commercials.map((commercial) => <option key={commercial.id} value={commercial.id}>{commercial.nom}</option>)}</select></label>
              <label><span>Début de location</span><input type="datetime-local" value={dateDebut} onChange={(event) => setDateDebut(event.target.value)} required /></label>
              <label><span>Fin prévue de location</span><input type="datetime-local" value={dateFin} onChange={(event) => setDateFin(event.target.value)} required /></label>
            </>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>Annuler</button>
          <button className="primary small" type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"} <Icon name="check" size={17} />
          </button>
        </div>
      </form>
    </div>
  )
}

function VehicleModal({
  form,
  set,
  models,
  allModels,
  categories,
  centres,
  editing,
  close,
  saved,
}: {
  form: Record<string, string>
  set: (key: string, value: string) => void
  models: Model[]
  allModels: Model[]
  categories: Category[]
  centres: Centre[]
  editing: Vehicle | null
  close: () => void
  saved: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (
      form.dateEntreeParc &&
      form.dateProchaineVisiteTechnique &&
      form.dateProchaineVisiteTechnique < form.dateEntreeParc
    ) {
      setError(
        "La date de visite technique ne peut pas précéder l’entrée au parc.",
      )
      return
    }

    const body = Object.fromEntries(
      Object.keys(emptyForm)
        .filter((key) => form[key] !== "")
        .map((key) => {
          const value = form[key]!
          return [
            "categorieId",
            "annee",
            "nbPlaces",
            "kilometrage",
            "centreId",
            "prixAchat",
          ].includes(key)
            ? [key, Number(value)]
            : [key, value]
        }),
    )

    try {
      await apiFetch(`/api/vehicules${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PUT" : "POST",
        body,
      })
      await saved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible")
    }
  }

  const field = (
    label: string,
    key: string,
    type = "text",
    required = false,
  ) => (
    <label>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={form[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        required={required}
        min={type === "number" ? "0" : undefined}
      />
    </label>
  )

  return (
    <div className="modal-backdrop">
      <form className="modal vehicle-modal" onSubmit={submit}>
        <button
          className="modal-close"
          type="button"
          onClick={close}
          aria-label="Fermer"
        >
          <Icon name="close" />
        </button>
        <p className="kicker">PARC AUTOMOBILE</p>
        <h2>{editing ? "Modifier" : "Enregistrer"} un véhicule</h2>
        <div className="modal-fields">
          {field("Immatriculation", "immatriculation", "text", true)}
          <label>
            <span>Marque *</span>
            <select
              value={form.marque}
              required
              onChange={(e) => {
                set("marque", e.target.value)
                set("modele", "")
                set("categorieId", "")
              }}
            >
              <option value="">Choisir</option>
              {[...new Set(allModels.map((m) => m.marque))].map((brand) => (
                <option key={brand}>{brand}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Modèle *</span>
            <select
              value={form.modele}
              required
              onChange={(e) => {
                set("modele", e.target.value)
                const model = models.find((m) => m.nom === e.target.value)
                if (model?.categorieId)
                  set("categorieId", String(model.categorieId))
              }}
            >
              <option value="">Choisir</option>
              {models.map((m) => (
                <option key={m.id}>{m.nom}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Catégorie</span>
            <select
              value={form.categorieId}
              onChange={(e) => set("categorieId", e.target.value)}
            >
              <option value="">Choisir</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </select>
          </label>
          {field("Version", "version")}
          {field("N° de châssis (VIN)", "numeroChassis")}
          {field("Année", "annee", "number")}
          <div className="vehicle-color-field">
            <span className="vehicle-color-label">Couleur</span>
            <div className="vehicle-color-options" aria-label="Couleurs proposées">
              {vehicleColors.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  className={`vehicle-color-option${form.couleur === color.name ? " selected" : ""}`}
                  aria-label={color.name}
                  aria-pressed={form.couleur === color.name}
                  onClick={() => set("couleur", color.name)}
                >
                  <span
                    className="vehicle-color-swatch"
                    style={{ backgroundColor: color.value }}
                    aria-hidden="true"
                  />
                  <span>{color.name}</span>
                </button>
              ))}
            </div>
            <label className="vehicle-color-custom">
              <span>Autre couleur ou précision</span>
              <input
                type="text"
                value={form.couleur}
                onChange={(event) => set("couleur", event.target.value)}
                placeholder="Sélectionner ou saisir une couleur"
                maxLength={30}
              />
            </label>
          </div>
          <label>
            <span>Carburant</span>
            <select
              value={form.carburant}
              onChange={(e) => set("carburant", e.target.value)}
            >
              <option value="">Non renseigné</option>
              {["ESSENCE", "DIESEL", "HYBRIDE", "ELECTRIQUE"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {field("Nombre de places", "nbPlaces", "number")}
          {field("Kilométrage", "kilometrage", "number", true)}
          {field("Prix d’achat", "prixAchat", "number")}
          {field("Date d’achat", "dateAchat", "date")}
          <label>
            <span>Segment du parc *</span>
            <select
              value={form.segmentParc}
              required
              onChange={(e) => set("segmentParc", e.target.value)}
            >
              {["LCD", "LLD", "LEASING", "IMPRO", "AUTRE"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Centre de rattachement</span>
            <select
              value={form.centreId}
              onChange={(e) => set("centreId", e.target.value)}
            >
              <option value="">Non renseigné</option>
              {centres.map((centre) => (
                <option key={centre.id} value={centre.id}>
                  {centre.nom}
                </option>
              ))}
            </select>
          </label>
          {field("Date d’entrée au parc", "dateEntreeParc", "date")}
          {field("Date de mise en service", "dateMiseEnService", "date")}
          {field(
            "Prochaine visite technique",
            "dateProchaineVisiteTechnique",
            "date",
          )}
          {field("Expiration assurance", "dateExpirationAssurance", "date")}
          {field("Groupe géolocalisation", "groupeGeolocalisation")}
          {field("Observation", "observation")}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Annuler
          </button>
          <button className="primary small" type="submit">
            Enregistrer <Icon name="check" size={17} />
          </button>
        </div>
      </form>
    </div>
  )
}

function SaleModal({
  vehicle,
  clients,
  commercials,
  close,
  saved,
}: {
  vehicle: Vehicle
  clients: ClientOption[]
  commercials: CommercialOption[]
  close: () => void
  saved: () => Promise<void>
}) {
  const [form, setForm] = useState({
    numeroVente: `VTE-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`,
    acheteurId: "",
    dateVente: localDate(),
    prixVente: "0",
    fraisVente: "0",
    motifVente: saleMotives[0]!,
    etatVehicule: saleConditions[0]!,
    canalVente: "",
    statutPaiement: "NON_PAYEE",
    dateRemiseVehicule: "",
    referenceCession: "",
    commercialId: "",
    observation: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setConfirming(true)
  }

  const confirmSale = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch("/api/vehicules/ventes", {
        method: "POST",
        body: {
          numeroVente: form.numeroVente,
          vehiculeId: vehicle.id,
          acheteurId: Number(form.acheteurId),
          dateVente: form.dateVente,
          prixVente: Number(form.prixVente),
          fraisVente: Number(form.fraisVente),
          motifVente: form.motifVente,
          etatVehicule: form.etatVehicule,
          kilometrageVente: vehicle.kilometrage,
          canalVente: form.canalVente || null,
          statutPaiement: form.statutPaiement,
          dateRemiseVehicule: form.dateRemiseVehicule || null,
          referenceCession: form.referenceCession || null,
          commercialId: form.commercialId ? Number(form.commercialId) : null,
          observation: form.observation || null,
        },
      })
      await saved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement de la vente impossible")
      setSaving(false)
    }
  }

  return <>
  <div className="modal-backdrop"><form className="modal vehicle-modal" onSubmit={submit}>
    <button className="modal-close" type="button" onClick={close} aria-label="Fermer"><Icon name="close" /></button>
    <p className="kicker">CESSION DE VÉHICULE</p><h2>Vendre {vehicle.immatriculation}</h2>
    <div className="modal-fields">
      <label><span>N° de vente *</span><input required maxLength={30} value={form.numeroVente} onChange={(event) => set("numeroVente", event.target.value)} /></label>
      <label><span>Acheteur *</span><select required value={form.acheteurId} onChange={(event) => set("acheteurId", event.target.value)}><option value="">Sélectionner un acheteur</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.nom}</option>)}</select></label>
      <label><span>Date de vente *</span><input type="date" required value={form.dateVente} onChange={(event) => set("dateVente", event.target.value)} /></label>
      <label><span>Prix convenu *</span><input type="number" min="0" step="0.01" required value={form.prixVente} onChange={(event) => set("prixVente", event.target.value)} /></label>
      <label><span>Frais de vente</span><input type="number" min="0" step="0.01" value={form.fraisVente} onChange={(event) => set("fraisVente", event.target.value)} /></label>
      <label><span>Motif *</span><select required value={form.motifVente} onChange={(event) => set("motifVente", event.target.value)}>{saleMotives.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>État du véhicule *</span><select required value={form.etatVehicule} onChange={(event) => set("etatVehicule", event.target.value)}>{saleConditions.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>Canal de vente</span><select value={form.canalVente} onChange={(event) => set("canalVente", event.target.value)}><option value="">Non renseigné</option>{saleChannels.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>Statut paiement</span><select value={form.statutPaiement} onChange={(event) => set("statutPaiement", event.target.value)}><option>NON_PAYEE</option><option>PARTIELLE</option><option>PAYEE</option></select></label>
      <label><span>Date de remise</span><input type="date" value={form.dateRemiseVehicule} onChange={(event) => set("dateRemiseVehicule", event.target.value)} /></label>
      <label><span>Référence de cession</span><input maxLength={60} value={form.referenceCession} onChange={(event) => set("referenceCession", event.target.value)} /></label>
      <label><span>Vendeur</span><select value={form.commercialId} onChange={(event) => set("commercialId", event.target.value)}><option value="">Non renseigné</option>{commercials.map((commercial) => <option key={commercial.id} value={commercial.id}>{commercial.nom}</option>)}</select></label>
      <label><span>Kilométrage à la vente</span><input type="number" value={vehicle.kilometrage} readOnly /></label>
      <label><span>Observation</span><input maxLength={255} value={form.observation} onChange={(event) => set("observation", event.target.value)} /></label>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Annuler</button><button className="primary small" type="submit" disabled={saving}>Enregistrer la vente</button></div>
  </form></div>
  {confirming && <div className="modal-backdrop"><div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="sale-confirm-title">
    <p className="kicker">CONFIRMATION DÉFINITIVE</p>
    <h2 id="sale-confirm-title">Conclure la vente ?</h2>
    <p>Cette action est irréversible. Le véhicule sera marqué SORTIE_DEFINITIVE et ne pourra plus être modifié ni remis en circulation depuis ce module.</p>
    {error && <p className="form-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" disabled={saving} onClick={() => setConfirming(false)}>Retour</button><button type="button" className="danger" disabled={saving} onClick={() => void confirmSale()}>{saving ? "Enregistrement…" : "Conclure définitivement"}</button></div>
  </div></div>}
  </>
}
