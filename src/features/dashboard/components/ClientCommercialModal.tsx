import { useEffect, useState } from "react"

import type { FormEvent } from "react"

import { createPortal } from "react-dom"

import { exportUrl, apiFetch } from "@/shared/api/client"

import StatusBadge from "@/shared/components/StatusBadge"
import { notifyDashboardMutation } from "@/shared/components/dashboardNotifications"

import {
  fetchClientFiche,
  fetchCommercialFiche,
  formatDateFr,
  formatMontant,
  type ClientDetailDto,
  type CommercialFicheDto,
} from "@/shared/data/dashboardService"

type ManagedModule = "Clients" | "Commerciaux"

type ModalMode = "details" | "edit"

type ClientType = "Particulier" | "Entreprise" | "Organisation"

interface ClientDraft {
  nom: string

  prenom: string

  type: ClientType

  telephone: string

  email: string

  adresse: string

  numPermis: string
}

interface CommercialDraft {
  nom: string

  prenom: string

  abreviation: string

  telephone: string

  email: string
}

const fieldClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"

function dateLabel(value: string | null | undefined): string {
  if (!value) return "—"

  const date = value.slice(0, 10)

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDateFr(date) : value
}

function commercialEmail(commercial: CommercialFicheDto): string {
  return (
    commercial.email ??
    commercial.contact

      .split("·")

      .map((part) => part.trim())

      .find((part) => part.includes("@")) ??
    ""
  )
}

function commercialPhone(commercial: CommercialFicheDto): string {
  return (
    commercial.telephone ??
    commercial.contact

      .split("·")

      .map((part) => part.trim())

      .find((part) => part && !part.includes("@")) ??
    ""
  )
}

function clientType(value: string): ClientType {
  if (
    value === "Particulier" ||
    value === "Entreprise" ||
    value === "Organisation"
  ) {
    return value
  }

  throw new Error(`Type de client inconnu : ${value}`)
}

export default function ClientCommercialModal({
  module,

  id,

  mode,

  close,

  onSaved,
}: {
  module: ManagedModule

  id: number

  mode: ModalMode

  close: () => void

  onSaved: () => void
}) {
  const [client, setClient] = useState<ClientDetailDto | null>(null)

  const [commercial, setCommercial] = useState<CommercialFicheDto | null>(null)

  const [clientDraft, setClientDraft] = useState<ClientDraft>({
    nom: "",

    prenom: "",

    type: "Particulier",

    telephone: "",

    email: "",

    adresse: "",

    numPermis: "",
  })

  const [commercialDraft, setCommercialDraft] = useState<CommercialDraft>({
    nom: "",

    prenom: "",

    abreviation: "",

    telephone: "",

    email: "",
  })

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setLoading(true)

    setError(null)

    const loadRecord = async () => {
      if (module === "Clients") {
        const clientRecord = await fetchClientFiche(id)

        if (!active) return

        setClient(clientRecord)

        setClientDraft({
          nom: clientRecord.nomFamille ?? clientRecord.nom,

          prenom: clientRecord.prenom ?? "",

          type: clientType(clientRecord.type),

          telephone: clientRecord.telephone,

          email: clientRecord.email ?? "",

          adresse: clientRecord.adresse ?? "",

          numPermis: clientRecord.numPermis ?? "",
        })

        return
      }

      const commercialRecord = await fetchCommercialFiche(id)

      if (!active) return

      setCommercial(commercialRecord)

      setCommercialDraft({
        nom: commercialRecord.nomFamille ?? commercialRecord.nom,

        prenom: commercialRecord.prenom ?? "",

        abreviation: commercialRecord.abreviation ?? "",

        telephone: commercialPhone(commercialRecord),

        email: commercialEmail(commercialRecord),
      })
    }

    loadRecord()

      .catch((e: unknown) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Chargement de la fiche impossible",
          )
      })

      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, module])

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    setError(null)

    setSaving(true)

    try {
      if (module === "Clients") {
        await apiFetch(`/api/clients/${id}`, {
          method: "PUT",

          body: {
            ...clientDraft,

            nom: clientDraft.nom.trim(),

            prenom: clientDraft.prenom.trim(),

            telephone: clientDraft.telephone.trim(),

            email: clientDraft.email.trim(),

            adresse: clientDraft.adresse.trim(),

            numPermis: clientDraft.numPermis.trim(),
          },
        })
      } else {
        await apiFetch(`/api/commerciaux/${id}`, {
          method: "PUT",

          body: {
            ...commercialDraft,

            nom: commercialDraft.nom.trim(),

            prenom: commercialDraft.prenom.trim(),

            abreviation: commercialDraft.abreviation.trim(),

            telephone: commercialDraft.telephone.trim(),

            email: commercialDraft.email.trim(),
          },
        })
      }

      notifyDashboardMutation(
        `${module === "Clients" ? "Client" : "Commercial"} modifié avec succès.`,
      )
      onSaved()

      close()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Modification impossible")
    } finally {
      setSaving(false)
    }
  }

  const closeIfIdle = () => {
    if (!saving) close()
  }

  const title =
    mode === "edit"
      ? `Modifier ${module === "Clients" ? "le client" : "le commercial"}`
      : module === "Clients"
        ? "Fiche client"
        : "Fiche de performance"

  return createPortal(
    <div className="modal-backdrop" onClick={closeIfIdle}>
      <section
        className={`modal client-commercial-modal${mode === "edit" ? "" : " view-mode"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-commercial-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="client-commercial-modal-header">
          <div>
            <p className="kicker">HERTZ BÉNIN</p>
            <h2 id="client-commercial-modal-title">{title}</h2>
            {!loading && !error && (
              <p className="client-commercial-subtitle">
                {module === "Clients" ? client?.nom : commercial?.nom}
              </p>
            )}
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={closeIfIdle}
            disabled={saving}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        {loading ? (
          <p className="py-8 text-sm text-slate-500">Chargement de la fiche…</p>
        ) : error && !client && !commercial ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : mode === "edit" ? (
          <form className="client-commercial-edit-form" onSubmit={submit}>
            <div className="modal-fields">
              {module === "Clients" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Nom de famille
                      </span>
                      <input
                        className={fieldClass}
                        value={clientDraft.nom}
                        onChange={(event) =>
                          setClientDraft((current) => ({
                            ...current,

                            nom: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Prénom
                      </span>
                      <input
                        className={fieldClass}
                        value={clientDraft.prenom}
                        onChange={(event) =>
                          setClientDraft((current) => ({
                            ...current,

                            prenom: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Type
                      </span>
                      <select
                        className={fieldClass}
                        value={clientDraft.type}
                        onChange={(event) =>
                          setClientDraft((current) => ({
                            ...current,

                            type: event.target.value as ClientType,
                          }))
                        }
                      >
                        <option>Particulier</option>
                        <option>Entreprise</option>
                        <option>Organisation</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Téléphone
                      </span>
                      <input
                        className={fieldClass}
                        value={clientDraft.telephone}
                        onChange={(event) =>
                          setClientDraft((current) => ({
                            ...current,

                            telephone: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      E-mail
                    </span>
                    <input
                      className={fieldClass}
                      type="email"
                      value={clientDraft.email}
                      onChange={(event) =>
                        setClientDraft((current) => ({
                          ...current,

                          email: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Adresse
                    </span>
                    <input
                      className={fieldClass}
                      value={clientDraft.adresse}
                      onChange={(event) =>
                        setClientDraft((current) => ({
                          ...current,

                          adresse: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Numéro de permis
                    </span>
                    <input
                      className={fieldClass}
                      value={clientDraft.numPermis}
                      onChange={(event) =>
                        setClientDraft((current) => ({
                          ...current,

                          numPermis: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Nom
                      </span>
                      <input
                        className={fieldClass}
                        value={commercialDraft.nom}
                        onChange={(event) =>
                          setCommercialDraft((current) => ({
                            ...current,

                            nom: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Prénom
                      </span>
                      <input
                        className={fieldClass}
                        value={commercialDraft.prenom}
                        onChange={(event) =>
                          setCommercialDraft((current) => ({
                            ...current,

                            prenom: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Abréviation
                      </span>
                      <input
                        className={fieldClass}
                        maxLength={10}
                        value={commercialDraft.abreviation}
                        onChange={(event) =>
                          setCommercialDraft((current) => ({
                            ...current,

                            abreviation: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Téléphone
                      </span>
                      <input
                        className={fieldClass}
                        value={commercialDraft.telephone}
                        onChange={(event) =>
                          setCommercialDraft((current) => ({
                            ...current,

                            telephone: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      E-mail
                    </span>
                    <input
                      className={fieldClass}
                      type="email"
                      value={commercialDraft.email}
                      onChange={(event) =>
                        setCommercialDraft((current) => ({
                          ...current,

                          email: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              )}
            </div>
            {error && (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <footer className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={closeIfIdle}
                disabled={saving}
              >
                Annuler
              </button>
              <button type="submit" className="primary small" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer les modifications"}
              </button>
            </footer>
          </form>
        ) : module === "Clients" && client ? (
          <div className="client-commercial-details">
            <dl className="client-commercial-summary">
              <div>
                <dt>Type</dt>
                <dd>{client.type}</dd>
              </div>
              <div>
                <dt>Téléphone</dt>
                <dd>{client.telephone}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{client.email || "—"}</dd>
              </div>
              <div>
                <dt>Adresse</dt>
                <dd>{client.adresse || "—"}</dd>
              </div>
              <div>
                <dt>Nombre de locations</dt>
                <dd>{client.locationsCount}</dd>
              </div>
              <div>
                <dt>Dernière opération</dt>
                <dd>{client.derniereOperation ?? "—"}</dd>
              </div>
            </dl>

            <section>
              <h3>Historique des locations</h3>
              {client.locations.length === 0 ? (
                <p className="client-commercial-empty">
                  Aucune location enregistrée pour ce client.
                </p>
              ) : (
                <div className="client-commercial-history">
                  <table>
                    <thead>
                      <tr>
                        <th>Contrat</th>
                        <th>Véhicule</th>
                        <th>Type</th>
                        <th>Période</th>
                        <th>Montant</th>
                        <th>État</th>
                      </tr>
                    </thead>
                    <tbody>
                      {client.locations.map((location) => (
                        <tr key={location.id}>
                          <td>{location.reference}</td>
                          <td>{location.vehicule}</td>
                          <td>{location.type}</td>
                          <td>
                            {dateLabel(location.dateDebut)} –{" "}
                            {dateLabel(location.dateFin)}
                          </td>
                          <td>
                            {location.montant === undefined
                              ? "—"
                              : formatMontant(location.montant)}
                          </td>
                          <td>
                            <StatusBadge value={location.statut} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {error && <p className="form-error">{error}</p>}
            <footer className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={closeIfIdle}
              >
                Fermer
              </button>
              <button
                type="button"
                className="primary small"
                onClick={() =>
                  window.open(
                    exportUrl(`/api/export/clients/${id}/fiche`),

                    "_blank",

                    "noopener",
                  )
                }
              >
                Imprimer la fiche PDF
              </button>
            </footer>
          </div>
        ) : commercial ? (
          <div className="client-commercial-details">
            <dl className="client-commercial-summary">
              <div>
                <dt>Contact</dt>
                <dd>{commercial.contact || "—"}</dd>
              </div>
              <div>
                <dt>Abréviation</dt>
                <dd>{commercial.abreviation || "—"}</dd>
              </div>
            </dl>
            <div className="client-commercial-metrics">
              <article>
                <p>Locations conclues</p>
                <strong>{commercial.locationsConclues}</strong>
              </article>
              <article>
                <p>Réservations conclues</p>
                <strong>{commercial.reservationsConclues}</strong>
              </article>
              <article>
                <p>Passages garage</p>
                <strong>{commercial.passagesGarageConclues}</strong>
              </article>
              <article>
                <p>Ventes conclues</p>
                <strong>{commercial.ventesConclues}</strong>
              </article>
              <article>
                <p>Chiffre d’affaires</p>
                <strong>{formatMontant(commercial.chiffreAffaires)}</strong>
              </article>
              <article>
                <p>Performance</p>
                <div>
                  <StatusBadge value={commercial.performance} />
                </div>
              </article>
            </div>
            <footer className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={closeIfIdle}
              >
                Fermer
              </button>
              <button
                type="button"
                className="primary small"
                onClick={() =>
                  window.open(
                    exportUrl(`/api/export/commerciaux/${id}/fiche`),
                    "_blank",
                    "noopener",
                  )
                }
              >
                Imprimer la fiche PDF
              </button>
            </footer>
          </div>
        ) : null}
      </section>
    </div>,

    document.body,
  )
}
