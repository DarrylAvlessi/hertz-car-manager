import { useEffect, useState } from "react"

import type { FormEvent } from "react"

import { createPortal } from "react-dom"

import { apiFetch } from "@/shared/api/client"

import type { DashboardModule } from "@/shared/data/types"

interface ClientOption {
  id: number

  nom: string
}

interface VehicleOption {
  id: number

  immatriculation: string

  marqueModele: string

  statut: string
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

const fieldClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"

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

  const [dateStart, setDateStart] = useState(() => localDate())

  const [dateEnd, setDateEnd] = useState(() => nextDate(localDate()))

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
        if (!availability?.disponible) {
          throw new Error(
            availabilityError ??
              availability?.motif ??
              "La disponibilité du véhicule doit être confirmée avant l’enregistrement.",
          )
        }

        const associations = {
          clientId: Number(clientId),

          vehiculeId: Number(vehicleId),

          commercialId: Number(commercialId),
        }

        if (isReservation) {
          await apiFetch("/api/reservations", {
            method: "POST",

            body: { ...associations, dateDepart: dateStart, dateFin: dateEnd },
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={closeIfIdle}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">
              Hertz Bénin
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="text-lg text-slate-500 disabled:opacity-50"
            onClick={closeIfIdle}
            disabled={loading}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          {(isClient || isCommercial) && (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  {isClient ? "Nom de famille" : "Nom"}
                </span>
                <input
                  className={fieldClass}
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder={isClient ? "Nom du client" : "Nom du commercial"}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Prénom
                </span>
                <input
                  className={fieldClass}
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  autoComplete="given-name"
                />
              </label>
              {isClient && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Type
                  </span>
                  <select
                    className={fieldClass}
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
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Abréviation
                  </span>
                  <input
                    className={fieldClass}
                    value={abreviation}
                    onChange={(e) => setAbreviation(e.target.value)}
                    maxLength={10}
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Téléphone
                </span>
                <input
                  className={fieldClass}
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="+229 ..."
                  required={isClient}
                  autoComplete="tel"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  E-mail
                </span>
                <input
                  className={fieldClass}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              {isClient && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Adresse
                    </span>
                    <input
                      className={fieldClass}
                      value={adresse}
                      onChange={(e) => setAdresse(e.target.value)}
                      autoComplete="street-address"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Numéro de permis
                    </span>
                    <input
                      className={fieldClass}
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

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Client
                </span>
                <select
                  className={fieldClass}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  disabled={optionsLoading || clients.length === 0}
                >
                  <option value="">Sélectionner un client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.nom}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Véhicule
                </span>
                <select
                  className={fieldClass}
                  value={vehicleId}
                  onChange={(e) => {
                    setVehicleId(e.target.value)

                    setAvailability(null)

                    setAvailabilityError(null)
                  }}
                  required
                  disabled={optionsLoading || vehicles.length === 0}
                >
                  <option value="">Sélectionner un véhicule</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.immatriculation} · {vehicle.marqueModele} (
                      {vehicle.statut})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Commercial
                </span>
                <select
                  className={fieldClass}
                  value={commercialId}
                  onChange={(e) => setCommercialId(e.target.value)}
                  required
                  disabled={optionsLoading || commercials.length === 0}
                >
                  <option value="">Sélectionner un commercial</option>
                  {commercials.map((commercial) => (
                    <option key={commercial.id} value={commercial.id}>
                      {commercial.nom}
                      {commercial.contact ? ` · ${commercial.contact}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    {isReservation ? "Date de départ" : "Date de début"}
                  </span>
                  <input
                    className={fieldClass}
                    type="date"
                    value={dateStart}
                    onChange={(e) => {
                      setDateStart(e.target.value)

                      setAvailability(null)

                      setAvailabilityError(null)
                    }}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Date de fin
                  </span>
                  <input
                    className={fieldClass}
                    type="date"
                    value={dateEnd}
                    min={dateStart}
                    onChange={(e) => {
                      setDateEnd(e.target.value)

                      setAvailability(null)

                      setAvailabilityError(null)
                    }}
                    required
                  />
                </label>
              </div>

              {isLocation && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Type de location
                    </span>
                    <select
                      className={fieldClass}
                      value={rentalType}
                      onChange={(e) =>
                        setRentalType(e.target.value as RentalType)
                      }
                    >
                      <option value="Courte durée">Courte durée</option>
                      <option value="Longue durée">Longue durée</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Montant total (FCFA)
                    </span>
                    <input
                      className={fieldClass}
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
                (clients.length === 0 ||
                  vehicles.length === 0 ||
                  commercials.length === 0) && (
                  <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Ajoutez au moins un client, un véhicule et un commercial
                    avant de créer cet enregistrement.
                  </p>
                )}
            </>
          )}

          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              onClick={closeIfIdle}
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                loading ||
                optionsLoading ||
                (needsAssociations &&
                  (Boolean(optionsError) ||
                    clients.length === 0 ||
                    vehicles.length === 0 ||
                    commercials.length === 0 ||
                    availabilityChecking ||
                    availability?.disponible !== true))
              }
            >
              {loading ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>,

    document.body,
  )
}
