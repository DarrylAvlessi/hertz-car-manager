import { useEffect, useState } from "react"

import type { FormEvent } from "react"

import { createPortal } from "react-dom"

import { apiFetch } from "@/shared/api/client"
import { notifyDashboardMutation } from "@/shared/components/dashboardNotifications"
import SearchableSelect from "@/shared/components/SearchableSelect"
import { canUseVehicleForNewOperation } from "@/shared/data/vehicleStatus"

import type { DashboardModule } from "@/shared/data/types"

interface ClientOption {
  id: number

  nom: string
}

interface VehicleOption {
  id: number

  immatriculation: string

  marqueModele?: string

  statut?: string
}

interface CommercialOption {
  id: number

  nom: string

  contact: string
}

interface AvailabilityResponse {
  disponible: boolean

  motif: string | null
}

type RentalType = "Courte durée" | "Longue durée"

function localDate(date = new Date()): string {
  const year = date.getFullYear()

  const month = String(date.getMonth() + 1).padStart(2, "0")

  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function nextDate(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00`)

  date.setDate(date.getDate() + 1)

  return localDate(date)
}

export default function AddModal({
  module,

  close,

  onCreated,
}: {
  module: DashboardModule

  close: () => void

  onCreated?: () => void
}) {
  const [loading, setLoading] = useState(false)

  const [optionsLoading, setOptionsLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const [optionsError, setOptionsError] = useState<string | null>(null)

  const [nom, setNom] = useState("")

  const [prenom, setPrenom] = useState("")

  const [telephone, setTelephone] = useState("")

  const [email, setEmail] = useState("")

  const [adresse, setAdresse] = useState("")

  const [numPermis, setNumPermis] = useState("")

  const [abreviation, setAbreviation] = useState("")

  const [type, setType] = useState("Particulier")

  const [clients, setClients] = useState<ClientOption[]>([])

  const [vehicles, setVehicles] = useState<VehicleOption[]>([])

  const [commercials, setCommercials] = useState<CommercialOption[]>([])

  const [clientId, setClientId] = useState("")

  const [vehicleId, setVehicleId] = useState("")

  const [commercialId, setCommercialId] = useState("")

  const [dateReservation, setDateReservation] = useState(() => localDate())

  const [dateStart, setDateStart] = useState(() =>
    module === "Réservations" ? "" : localDate(),
  )

  const [dateEnd, setDateEnd] = useState(() =>
    module === "Réservations" ? "" : nextDate(localDate()),
  )

  const [mission, setMission] = useState("")

  const [missionPlace, setMissionPlace] = useState("")

  const [confirmationStatus, setConfirmationStatus] = useState("")

  const [billingStatus, setBillingStatus] = useState("NON_FACTUREE")

  const [paymentStatus, setPaymentStatus] = useState("NON_PAYEE")

  const [rentalType, setRentalType] = useState<RentalType>("Courte durée")

  const [amount, setAmount] = useState("")

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(
    null,
  )

  const [availabilityChecking, setAvailabilityChecking] = useState(false)

  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  )

  const isReservation = module === "Réservations"

  const isLocation = module === "Locations"

  const isClient = module === "Clients"

  const isCommercial = module === "Commerciaux"

  const needsAssociations = isReservation || isLocation

  const title = isReservation
    ? "Créer une réservation"
    : isLocation
      ? "Créer une location"
      : `Ajouter un ${isCommercial ? "commercial" : "client"}`

  useEffect(() => {
    if (!needsAssociations) return

    let active = true

    setOptionsLoading(true)

    setOptionsError(null)

    Promise.all([
      apiFetch<ClientOption[]>("/api/clients"),

      apiFetch<VehicleOption[]>("/api/vehicules"),

      apiFetch<CommercialOption[]>("/api/commerciaux"),
    ])

      .then(([clientRows, vehicleRows, commercialRows]) => {
        if (!active) return

        setClients(clientRows)

        setVehicles(vehicleRows)

        setCommercials(commercialRows)
      })

      .catch((e: unknown) => {
        if (active) {
          setOptionsError(
            e instanceof Error
              ? e.message
              : "Impossible de charger les clients, véhicules et commerciaux",
          )
        }
      })

      .finally(() => {
        if (active) setOptionsLoading(false)
      })

    return () => {
      active = false
    }
  }, [needsAssociations])

  useEffect(() => {
    if (!needsAssociations || !vehicleId || !dateStart || !dateEnd) {
      setAvailability(null)

      setAvailabilityChecking(false)

      setAvailabilityError(null)

      return
    }

    if (dateEnd < dateStart) {
      setAvailability(null)

      setAvailabilityChecking(false)

      setAvailabilityError(
        "La date de fin doit être après ou égale à la date de début.",
      )

      return
    }

    let active = true

    setAvailability(null)

    setAvailabilityError(null)

    setAvailabilityChecking(true)

    const params = new URLSearchParams({ from: dateStart, to: dateEnd })

    apiFetch<AvailabilityResponse>(
      `/api/vehicules/${vehicleId}/disponibilite?${params.toString()}`,
    )

      .then((result) => {
        if (active) setAvailability(result)
      })

      .catch((e: unknown) => {
        if (active) {
          setAvailabilityError(
            e instanceof Error
              ? e.message
              : "Vérification de disponibilité impossible",
          )
        }
      })

      .finally(() => {
        if (active) setAvailabilityChecking(false)
      })

    return () => {
      active = false
    }
  }, [dateEnd, dateStart, needsAssociations, vehicleId])

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    setError(null)

    setLoading(true)

    try {
      if (isClient) {
        await apiFetch("/api/clients", {
          method: "POST",

          body: {
            nom,

            prenom,

            type,

            telephone,

            email,

            adresse,

            numPermis,
          },
        })
      } else if (isCommercial) {
        await apiFetch("/api/commerciaux", {
          method: "POST",

          body: { nom, prenom, abreviation, telephone, email },
        })
      } else if (isReservation || isLocation) {
        if (isReservation && Boolean(dateStart) !== Boolean(dateEnd)) {
          throw new Error(
            "Renseignez les deux dates prévues ou laissez-les toutes les deux vides.",
          )
        }

        if (isLocation || (dateStart && dateEnd)) {
          if (!availability?.disponible) {
            throw new Error(
              availabilityError ??
                availability?.motif ??
                "La disponibilité du véhicule doit être confirmée avant l’enregistrement.",
            )
          }
        }

        if (isLocation && (!clientId || !commercialId)) {
          throw new Error(
            "Un client et un commercial sont obligatoires pour créer une location.",
          )
        }

        const associations = {
          clientId: clientId ? Number(clientId) : null,

          vehiculeId: Number(vehicleId),

          commercialId: commercialId ? Number(commercialId) : null,
        }

        if (isReservation) {
          await apiFetch("/api/reservations", {
            method: "POST",

            body: {
              ...associations,
              dateReservation: dateReservation || null,
              dateDepart: dateStart || null,
              dateFin: dateEnd || null,
              mission: mission.trim() || null,
              lieuMission: missionPlace.trim() || null,
              statutConfirmation: confirmationStatus.trim() || null,
              statutFacturation: billingStatus,
              statutPaiement: paymentStatus,
            },
          })
        } else {
          await apiFetch("/api/locations", {
            method: "POST",

            body: {
              ...associations,

              type: rentalType,

              dateDebut: dateStart,

              dateFin: dateEnd,

              montant: Number(amount),
            },
          })
        }
      } else {
        throw new Error(
          `L’ajout de ${module.toLowerCase()} n’est pas encore pris en charge.`,
        )
      }

      notifyDashboardMutation(
        `${isReservation ? "Réservation" : isLocation ? "Location" : isCommercial ? "Commercial" : "Client"} enregistré${isReservation || isLocation ? "e" : ""} avec succès.`,
      )
      onCreated?.()

      close()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible")
    } finally {
      setLoading(false)
    }
  }

  const closeIfIdle = () => {
    if (!loading) close()
  }

  return createPortal(
    <div className="modal-backdrop" onClick={closeIfIdle}>
      <form
        className="modal location-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <button
          type="button"
          className="modal-close"
          onClick={closeIfIdle}
          disabled={loading}
          aria-label="Fermer"
        >
          ×
        </button>
        <p className="kicker">HERTZ BÉNIN</p>
        <h2>{title}</h2>
        <div className="modal-fields">
          {(isClient || isCommercial) && (
            <>
              <label>
                <span>{isClient ? "Nom de famille" : "Nom"}</span>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder={isClient ? "Nom du client" : "Nom du commercial"}
                  required
                />
              </label>
              <label>
                <span>Prénom</span>
                <input
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  autoComplete="given-name"
                />
              </label>
              {isClient && (
                <label>
                  <span>Type</span>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    <option>Particulier</option>
                    <option>Entreprise</option>
                    <option>Organisation</option>
                  </select>
                </label>
              )}
              {isCommercial && (
                <label>
                  <span>Abréviation</span>
                  <input
                    value={abreviation}
                    onChange={(e) => setAbreviation(e.target.value)}
                    maxLength={10}
                  />
                </label>
              )}
              <label>
                <span>Téléphone</span>
                <input
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="+229 ..."
                  required={isClient}
                  autoComplete="tel"
                />
              </label>
              <label>
                <span>E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              {isClient && (
                <>
                  <label>
                    <span>Adresse</span>
                    <input
                      value={adresse}
                      onChange={(e) => setAdresse(e.target.value)}
                      autoComplete="street-address"
                    />
                  </label>
                  <label>
                    <span>Numéro de permis</span>
                    <input
                      value={numPermis}
                      onChange={(e) => setNumPermis(e.target.value)}
                    />
                  </label>
                </>
              )}
            </>
          )}

          {needsAssociations && (
            <>
              {optionsLoading && (
                <p className="text-sm text-slate-500">
                  Chargement des clients, véhicules et commerciaux…
                </p>
              )}
              {optionsError && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Chargement des choix impossible : {optionsError}
                </p>
              )}

              <label>
                <span>Client</span>
                <SearchableSelect
                  value={clientId}
                  onChange={setClientId}
                  options={clients.map((client) => ({
                    value: String(client.id),
                    label: client.nom,
                  }))}
                  placeholder="Rechercher un client…"
                  required={isLocation}
                  disabled={optionsLoading || (!isReservation && clients.length === 0)}
                />
              </label>

              <label>
                <span>Véhicule</span>
                <SearchableSelect
                  value={vehicleId}
                  onChange={(value) => {
                    setVehicleId(value)
                    setAvailability(null)
                    setAvailabilityError(null)
                  }}
                  options={vehicles.map((vehicle) => ({
                    value: String(vehicle.id),
                    label: `${vehicle.immatriculation}${vehicle.marqueModele?.trim() ? ` · ${vehicle.marqueModele.trim()}` : ""} (${vehicle.statut ?? "STATUT INCONNU"})`,
                    searchText: vehicle.statut ?? "",
                    disabled: !canUseVehicleForNewOperation(vehicle.statut),
                  }))}
                  placeholder="Rechercher un véhicule…"
                  required
                  disabled={optionsLoading || vehicles.length === 0}
                />
                <small>
                  Une nouvelle location ou réservation nécessite un véhicule
                  en entrée au parc ou de retour.
                </small>
              </label>

              <label>
                <span>Commercial</span>
                <SearchableSelect
                  value={commercialId}
                  onChange={setCommercialId}
                  options={commercials.map((commercial) => ({
                    value: String(commercial.id),
                    label: `${commercial.nom}${commercial.contact ? ` · ${commercial.contact}` : ""}`,
                    searchText: commercial.contact,
                  }))}
                  placeholder="Rechercher un commercial…"
                  required={isLocation}
                  disabled={
                    optionsLoading || (!isReservation && commercials.length === 0)
                  }
                />
              </label>

              {isReservation && (
                <>
                  <label>
                    <span>Date de réservation</span>
                    <input
                      type="date"
                      value={dateReservation}
                      onChange={(e) => setDateReservation(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Mission</span>
                    <input
                      value={mission}
                      onChange={(e) => setMission(e.target.value)}
                      maxLength={150}
                    />
                  </label>
                  <label>
                    <span>Lieu de la mission</span>
                    <input
                      value={missionPlace}
                      onChange={(e) => setMissionPlace(e.target.value)}
                      maxLength={150}
                    />
                  </label>
                  <label>
                    <span>Confirmation</span>
                    <input
                      value={confirmationStatus}
                      onChange={(e) => setConfirmationStatus(e.target.value)}
                      maxLength={80}
                    />
                  </label>
                </>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label>
                  <span>
                    {isReservation ? "Date de départ prévue" : "Date de début"}
                  </span>
                  <input
                    type="date"
                    value={dateStart}
                    onChange={(e) => {
                      setDateStart(e.target.value)

                      setAvailability(null)

                      setAvailabilityError(null)
                    }}
                    required={isLocation}
                  />
                </label>
                <label>
                  <span>
                    {isReservation ? "Date de retour prévue" : "Date de fin"}
                  </span>
                  <input
                    type="date"
                    value={dateEnd}
                    min={dateStart}
                    onChange={(e) => {
                      setDateEnd(e.target.value)

                      setAvailability(null)

                      setAvailabilityError(null)
                    }}
                    required={isLocation}
                  />
                </label>
              </div>

              {isReservation && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label>
                    <span>Facturation</span>
                    <select
                      value={billingStatus}
                      onChange={(e) => setBillingStatus(e.target.value)}
                    >
                      <option value="NON_FACTUREE">Non facturée</option>
                      <option value="EN_ATTENTE_BON_COMMANDE">
                        En attente de bon de commande
                      </option>
                      <option value="FACTURE_EMISE_PAIEMENT_EN_ATTENTE">
                        Facture émise, paiement en attente
                      </option>
                      <option value="PAIEMENT_EFFECTUE">Paiement effectué</option>
                    </select>
                  </label>
                  <label>
                    <span>Paiement</span>
                    <select
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value)}
                    >
                      <option value="NON_PAYEE">Non payée</option>
                      <option value="PAYEE">Payée</option>
                    </select>
                  </label>
                </div>
              )}

              {isLocation && (
                <>
                  <label>
                    <span>Type de location</span>
                    <select
                      value={rentalType}
                      onChange={(e) =>
                        setRentalType(e.target.value as RentalType)
                      }
                    >
                      <option value="Courte durée">Courte durée</option>
                      <option value="Longue durée">Longue durée</option>
                    </select>
                  </label>
                  <label>
                    <span>Montant total (FCFA)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </label>
                </>
              )}

              {availabilityChecking && (
                <p className="text-sm text-slate-500">
                  Vérification de la disponibilité du véhicule…
                </p>
              )}
              {availability && (
                <p
                  className={`rounded border px-3 py-2 text-sm ${
                    availability.disponible
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  {availability.disponible
                    ? "Véhicule disponible sur cette période."
                    : (availability.motif ??
                      "Véhicule indisponible sur cette période.")}
                </p>
              )}
              {availabilityError && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {availabilityError}
                </p>
              )}

              {!optionsLoading &&
                !optionsError &&
                (vehicles.length === 0 ||
                  (!isReservation &&
                    (clients.length === 0 || commercials.length === 0))) && (
                  <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {isReservation
                      ? "Ajoutez au moins un véhicule avant de créer une réservation."
                      : "Ajoutez au moins un client, un véhicule et un commercial avant de créer cet enregistrement."}
                  </p>
                )}
            </>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            onClick={closeIfIdle}
            disabled={loading}
          >
            Annuler
          </button>
          <button
            type="submit"
            className="primary small"
            disabled={
              loading ||
              optionsLoading ||
              (needsAssociations &&
                (Boolean(optionsError) ||
                vehicles.length === 0 ||
                (!isReservation &&
                  (clients.length === 0 || commercials.length === 0)) ||
                ((isLocation || Boolean(dateStart && dateEnd)) &&
                  (availabilityChecking || availability?.disponible !== true))))
            }
          >
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>,

    document.body,
  )
}
