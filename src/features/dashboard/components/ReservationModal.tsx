import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { apiFetch } from "@/shared/api/client"
import Icon from "@/shared/components/Icon"
import SearchableSelect from "@/shared/components/SearchableSelect"
import { notifyDashboardMutation } from "@/shared/components/dashboardNotifications"
import { canUseVehicleForNewOperation } from "@/shared/data/vehicleStatus"
import type { ReservationFicheDto } from "@/shared/data/dashboardService"
import { formatDateFr } from "@/shared/data/dashboardService"

interface Option {
  id: number
  nom: string
}

interface VehicleOption {
  id: number
  immatriculation: string
  marque?: string
  modele?: string
  marqueModele?: string
  statut?: string
}

interface ReservationHistoryEntry {
  id: number
  ancienStatut: string | null
  nouveauStatut: string
  dateChangement: string
  commentaire: string | null
}

interface ReservationDraft {
  clientId: string
  vehiculeId: string
  commercialId: string
  clientImport: string
  commercialImport: string
  dateReservation: string
  dateDepart: string
  dateFin: string
  mission: string
  lieuMission: string
  statutConfirmation: string
  statutFacturation: string
  statutPaiement: string
}

const fieldClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"

const billingOptions = [
  ["NON_FACTUREE", "Non facturée"],
  ["EN_ATTENTE_BON_COMMANDE", "En attente de bon de commande"],
  ["FACTURE_EMISE_PAIEMENT_EN_ATTENTE", "Facture émise, paiement en attente"],
  ["PAIEMENT_EFFECTUE", "Paiement effectué"],
]

function dateValue(value?: string | null): string {
  return value?.slice(0, 10) ?? ""
}

function initialDraft(reservation: ReservationFicheDto): ReservationDraft {
  return {
    clientId: reservation.clientId?.toString() ?? "",
    vehiculeId: reservation.vehiculeId?.toString() ?? "",
    commercialId: reservation.commercialId?.toString() ?? "",
    clientImport: reservation.clientImport ?? "",
    commercialImport: reservation.commercialImport ?? "",
    dateReservation: dateValue(reservation.dateReservation),
    dateDepart: dateValue(reservation.dateDepart),
    dateFin: dateValue(reservation.dateFin),
    mission: reservation.mission ?? "",
    lieuMission: reservation.lieuMission ?? "",
    statutConfirmation: reservation.statutConfirmation ?? "",
    statutFacturation: reservation.statutFacturation ?? "NON_FACTUREE",
    statutPaiement: reservation.statutPaiement ?? "NON_PAYEE",
  }
}

export default function ReservationModal({
  id,
  mode,
  close,
  onSaved,
}: {
  id: number
  mode: "edit" | "history"
  close: () => void
  onSaved: () => void
}) {
  const [reservation, setReservation] = useState<ReservationFicheDto | null>(
    null,
  )
  const [history, setHistory] = useState<ReservationHistoryEntry[]>([])
  const [clients, setClients] = useState<Option[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [commercials, setCommercials] = useState<Option[]>([])
  const [draft, setDraft] = useState<ReservationDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    const requests: Promise<unknown>[] = [
      apiFetch<ReservationFicheDto>(`/api/reservations/${id}`),
    ]
    if (mode === "history") {
      requests.push(
        apiFetch<ReservationHistoryEntry[]>(
          `/api/reservations/${id}/history`,
        ),
      )
    } else {
      requests.push(
        apiFetch<Option[]>("/api/clients"),
        apiFetch<VehicleOption[]>("/api/vehicules"),
        apiFetch<Option[]>("/api/commerciaux"),
      )
    }

    Promise.all(requests)
      .then((results) => {
        if (!active) return
        const loaded = results[0] as ReservationFicheDto
        setReservation(loaded)
        if (mode === "history") {
          setHistory((results[1] as ReservationHistoryEntry[]) ?? [])
        } else {
          setClients((results[1] as Option[]) ?? [])
          setVehicles((results[2] as VehicleOption[]) ?? [])
          setCommercials((results[3] as Option[]) ?? [])
          setDraft(initialDraft(loaded))
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Chargement de la réservation impossible",
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, mode])

  const updateDraft = (key: keyof ReservationDraft, value: string) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/reservations/${id}`, {
        method: "PUT",
        body: {
          clientId: draft.clientId ? Number(draft.clientId) : null,
          vehiculeId: Number(draft.vehiculeId),
          commercialId: draft.commercialId ? Number(draft.commercialId) : null,
          clientImport: draft.clientImport.trim() || null,
          commercialImport: draft.commercialImport.trim() || null,
          dateReservation: draft.dateReservation || null,
          dateDepart: draft.dateDepart || null,
          dateFin: draft.dateFin || null,
          mission: draft.mission.trim() || null,
          lieuMission: draft.lieuMission.trim() || null,
          statutConfirmation: draft.statutConfirmation.trim() || null,
          statutFacturation: draft.statutFacturation,
          statutPaiement: draft.statutPaiement,
        },
      })
      notifyDashboardMutation("Réservation modifiée avec succès.")
      onSaved()
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Modification impossible",
      )
    } finally {
      setSaving(false)
    }
  }

  const closeIfIdle = () => {
    if (!saving) close()
  }

  const title =
    mode === "history" ? "Historique de la réservation" : "Modifier la réservation"

  return createPortal(
    <div className="modal-backdrop" onClick={closeIfIdle}>
      <div
        className="modal reservation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reservation-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={closeIfIdle}
          disabled={saving}
          aria-label="Fermer"
        >
          <Icon name="close" />
        </button>
        <p className="kicker">
          {mode === "history" ? "SUIVI" : "GESTION DES RÉSERVATIONS"}
        </p>
        <h2 id="reservation-modal-title">{title}</h2>
        {loading ? (
          <p>Chargement…</p>
        ) : error && !reservation ? (
          <p className="form-error" role="alert">{error}</p>
        ) : reservation && mode === "history" ? (
          <>
            <p className="detail-subtitle">
              {reservation.reference} · {reservation.immatriculation} ·{" "}
              {reservation.client || "Client non rapproché"}
            </p>
            {error && <p className="form-error" role="alert">{error}</p>}
            {history.length === 0 ? (
              <p>Aucun changement de statut enregistré.</p>
            ) : (
              <ol className="reservation-history">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <strong>
                      {entry.ancienStatut
                        ? `${entry.ancienStatut} → ${entry.nouveauStatut}`
                        : entry.nouveauStatut}
                    </strong>
                    <time>
                      {new Date(entry.dateChangement).toLocaleString("fr-FR")}
                    </time>
                    {entry.commentaire && <p>{entry.commentaire}</p>}
                  </li>
                ))}
              </ol>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={close}>
                Fermer
              </button>
            </div>
          </>
        ) : draft ? (
          <form onSubmit={(event) => void save(event)}>
            <div className="modal-fields">
              <label>
                <span>Client rattaché</span>
                <SearchableSelect
                  className={fieldClass}
                  value={draft.clientId}
                  onChange={(value) => updateDraft("clientId", value)}
                  options={clients.map((client) => ({
                    value: String(client.id),
                    label: client.nom,
                  }))}
                  placeholder="Rechercher un client…"
                  emptyOptionLabel="Aucun client"
                />
                <small>
                  Un véhicule déjà sélectionné peut être conservé. Pour en
                  choisir un autre, il doit être en entrée au parc ou de retour.
                </small>
              </label>
              <label>
                <span>Nom du client importé</span>
                <input
                  className={fieldClass}
                  value={draft.clientImport}
                  onChange={(event) => updateDraft("clientImport", event.target.value)}
                  maxLength={180}
                />
              </label>
              <label>
                <span>Véhicule</span>
                <SearchableSelect
                  className={fieldClass}
                  value={draft.vehiculeId}
                  onChange={(value) => updateDraft("vehiculeId", value)}
                  options={vehicles.map((vehicle) => ({
                    value: String(vehicle.id),
                    label: `${vehicle.immatriculation} · ${vehicle.marqueModele ??
                      `${vehicle.marque ?? ""} ${vehicle.modele ?? ""}`.trim()} (${vehicle.statut ?? "STATUT INCONNU"})`,
                    searchText: vehicle.statut,
                    disabled:
                      draft.vehiculeId !== String(vehicle.id) &&
                      !canUseVehicleForNewOperation(vehicle.statut),
                  }))}
                  placeholder="Rechercher un véhicule…"
                  required
                />
              </label>
              <label>
                <span>Commercial rattaché</span>
                <SearchableSelect
                  className={fieldClass}
                  value={draft.commercialId}
                  onChange={(value) => updateDraft("commercialId", value)}
                  options={commercials.map((commercial) => ({
                    value: String(commercial.id),
                    label: commercial.nom,
                  }))}
                  placeholder="Rechercher un commercial…"
                  emptyOptionLabel="Aucun commercial"
                />
              </label>
              <label>
                <span>Nom de l’agent importé</span>
                <input
                  className={fieldClass}
                  value={draft.commercialImport}
                  onChange={(event) =>
                    updateDraft("commercialImport", event.target.value)
                  }
                  maxLength={180}
                />
              </label>
              <label>
                <span>Date de réservation</span>
                <input
                  className={fieldClass}
                  type="date"
                  value={draft.dateReservation}
                  onChange={(event) =>
                    updateDraft("dateReservation", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Date de début prévue</span>
                <input
                  className={fieldClass}
                  type="date"
                  value={draft.dateDepart}
                  onChange={(event) => updateDraft("dateDepart", event.target.value)}
                />
              </label>
              <label>
                <span>Date de retour prévue</span>
                <input
                  className={fieldClass}
                  type="date"
                  min={draft.dateDepart || undefined}
                  value={draft.dateFin}
                  onChange={(event) => updateDraft("dateFin", event.target.value)}
                />
              </label>
              <label>
                <span>Mission</span>
                <input
                  className={fieldClass}
                  value={draft.mission}
                  onChange={(event) => updateDraft("mission", event.target.value)}
                  maxLength={150}
                />
              </label>
              <label>
                <span>Lieu de mission</span>
                <input
                  className={fieldClass}
                  value={draft.lieuMission}
                  onChange={(event) => updateDraft("lieuMission", event.target.value)}
                  maxLength={150}
                />
              </label>
              <label>
                <span>Confirmation</span>
                <input
                  className={fieldClass}
                  value={draft.statutConfirmation}
                  onChange={(event) =>
                    updateDraft("statutConfirmation", event.target.value)
                  }
                  maxLength={80}
                />
              </label>
              <label>
                <span>Facturation</span>
                <select
                  className={fieldClass}
                  value={draft.statutFacturation}
                  onChange={(event) =>
                    updateDraft("statutFacturation", event.target.value)
                  }
                >
                  {billingOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Paiement</span>
                <select
                  className={fieldClass}
                  value={draft.statutPaiement}
                  onChange={(event) =>
                    updateDraft("statutPaiement", event.target.value)
                  }
                >
                  <option value="NON_PAYEE">Non payée</option>
                  <option value="PAYEE">Payée</option>
                </select>
              </label>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={closeIfIdle}
                disabled={saving}
              >
                Annuler
              </button>
              <button type="submit" className="primary small" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        ) : reservation ? (
          <p>
            {reservation.reference} · {formatDateFr(reservation.dateDepart)}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
