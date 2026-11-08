import { useEffect, useMemo, useState } from "react"
import { useOutletContext } from "react-router-dom"

import Icon from "@/shared/components/Icon"
import DetailModal from "@/shared/components/DetailModal"

import { apiFetch } from "@/shared/api/client"

import { notifyDashboardMutation } from "@/shared/components/dashboardNotifications"

import { downloadCsv } from "@/shared/data/csv"

import type { DashboardOutletContext } from "../DashboardLayout"

import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"

type ContraventionDto = {
  id: number

  numeroContravention: string

  type: string

  dateInfraction: string

  montant: number

  frais: number

  devise: string

  statutPaiement: "IMPAYEE" | "PAYEE"

  dateReglement: string | null

  moyenPaiement: string | null

  numeroQuittance: string | null

  payeur: string | null

  statutRecouvrement: "NON_EFFECTUE" | "EFFECTUE" | "NON_LIEU"

  dateRecouvrement: string | null

  montantRecouvre: number

  fraisRecouvres: number

  vehiculeId: number

  immatriculation: string

  marque: string
  modele: string
  vehicule: string

  clientId: number | null

  client: string | null

  clientImport: string | null

  commercialId: number | null

  commercial: string | null

  commercialImport: string | null

  observation: string | null
}

type ContraventionDraft = {
  numeroContravention: string

  type: string

  dateInfraction: string

  montant: string

  frais: string

  statutPaiement: "IMPAYEE" | "PAYEE"

  dateReglement: string

  moyenPaiement: string

  numeroQuittance: string

  payeur: string

  statutRecouvrement: "NON_EFFECTUE" | "EFFECTUE" | "NON_LIEU"

  dateRecouvrement: string

  montantRecouvre: string

  fraisRecouvres: string

  vehiculeId: string

  clientId: string

  clientImport: string

  commercialId: string

  commercialImport: string

  observation: string
}

type ContraventionOptions = {
  vehicules: Array<{
    id: number

    immatriculation: string
    statut: string
    vehicule: string
  }>

  clients: Array<{
    id: number
    nom: string
  }>

  commerciaux: Array<{
    id: number
    nom: string
  }>
}

const CSV_HEADERS = [
  "N°",

  "Contravention",

  "N° de Contravention",

  "Date",

  "Montant",

  "Imatriculation ",

  "Marque ",

  "Modèl",

  "Client",

  "Agent de vent",

  "Statut",

  "Date de règlement",

  "Moyent de paiement",

  "N° de quittance",

  "Payeur",

  "Recouvrement",

  "Date du recouvrement",

  "Payée",

  "Excès de vitesse",
]

const CSV_TEMPLATE_HEADERS = CSV_HEADERS.slice(1)

const CSV_TEMPLATE_EXAMPLES: Array<Array<string | number>> = [
  [
    "EXEMPLE - À remplacer avant import",
    "Excès de vitesse",
    "ANATT-2026-001",
    "05/11/2026",
    "25000 XOF",
    "EXEMPLE - Immatriculation",
    "TOYOTA",
    "COROLLA",
    "EXEMPLE - Client",
    "EXEMPLE - Agent",
    "Payée",
    "12/11/2026",
    "Carte bancaire",
    "QUITT-2026-001",
    "ARCS BENIN",
    "Effectué",
    "05/11/2026",
    "Payée",
    "Effectué",
  ],
  [
    "EXEMPLE - À remplacer avant import",
    "Stationnement interdit",
    "ANATT-2026-002",
    "12/11/2026",
    "15000 XOF",
    "EXEMPLE - Immatriculation",
    "NISSAN",
    "KICKS",
    "EXEMPLE - Client",
    "EXEMPLE - Agent",
    "Payée",
    "12/11/2026",
    "Virement",
    "EXEMPLE - Quittance",
    "Client",
    "Effectué",
    "13/11/2026",
    "Payée",
    "Effectué",
  ],
]

const emptyDraft = (): ContraventionDraft => ({
  numeroContravention: "",

  type: "",

  dateInfraction: "",

  montant: "",

  frais: "0",

  statutPaiement: "IMPAYEE",

  dateReglement: "",

  moyenPaiement: "",

  numeroQuittance: "",

  payeur: "",

  statutRecouvrement: "NON_EFFECTUE",

  dateRecouvrement: "",

  montantRecouvre: "0",

  fraisRecouvres: "0",

  vehiculeId: "",

  clientId: "",

  clientImport: "",

  commercialId: "",

  commercialImport: "",

  observation: "",
})

const PAYMENT_LABELS: Record<ContraventionDto["statutPaiement"], string> = {
  IMPAYEE: "Impayée",

  PAYEE: "Payée",
}

const RECOVERY_LABELS: Record<ContraventionDto["statutRecouvrement"], string> =
  {
    NON_EFFECTUE: "Non effectué",

    EFFECTUE: "Effectué",

    NON_LIEU: "Non lieu",
  }

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ESPECES: "Espèces",
  CARTE_BANCAIRE: "Carte bancaire",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
  MTN_MOMO: "MTN-MoMo",
  MOOV_MONEY: "Moov-Money",
  MOBILE_MONEY: "Mobile money",
}

function dateForInput(value: string | null | undefined): string {
  return value?.slice(0, 10) ?? ""
}

function csvDate(value: string | null | undefined): string {
  if (!value) return ""

  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`)

  return Number.isNaN(parsed.getTime())
    ? ""
    : new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",

        day: "numeric",

        month: "long",

        year: "numeric",

        timeZone: "UTC",
      }).format(parsed)
}

function money(value: number): string {
  return `${value.toLocaleString("fr-FR")} XOF`
}

function draftFromRow(row: ContraventionDto): ContraventionDraft {
  return {
    numeroContravention: row.numeroContravention,

    type: row.type,

    dateInfraction: dateForInput(row.dateInfraction),

    montant: String(row.montant),

    frais: String(row.frais),

    statutPaiement: row.statutPaiement,

    dateReglement: dateForInput(row.dateReglement),

    moyenPaiement: row.moyenPaiement ?? "",

    numeroQuittance: row.numeroQuittance ?? "",

    payeur: row.payeur ?? "",

    statutRecouvrement: row.statutRecouvrement,

    dateRecouvrement: dateForInput(row.dateRecouvrement),

    montantRecouvre: String(row.montantRecouvre),

    fraisRecouvres: String(row.fraisRecouvres),

    vehiculeId: String(row.vehiculeId),

    clientId: row.clientId ? String(row.clientId) : "",

    clientImport: row.clientImport ?? "",

    commercialId: row.commercialId ? String(row.commercialId) : "",

    commercialImport: row.commercialImport ?? "",

    observation: row.observation ?? "",
  }
}

async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder("windows-1252").decode(buffer)
  }
}

export default function ContraventionsPage() {
  const { setPageActions } = useOutletContext<DashboardOutletContext>()

  const [rows, setRows] = useState<ContraventionDto[]>([])

  const [options, setOptions] = useState<ContraventionOptions>({
    vehicules: [],

    clients: [],

    commerciaux: [],
  })

  const [query, setQuery] = useState("")

  const [page, setPage] = useState(1)

  const [error, setError] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [importing, setImporting] = useState(false)

  const [draft, setDraft] = useState<ContraventionDraft | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)

  const [detail, setDetail] = useState<ContraventionDto | null>(null)

  const [confirming, setConfirming] = useState<ContraventionDto | null>(null)

  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true)

    try {
      const [data, choices] = await Promise.all([
        apiFetch<ContraventionDto[]>("/api/contraventions"),

        apiFetch<ContraventionOptions>("/api/contraventions/options"),
      ])

      setRows(data)

      setOptions(choices)

      setError(null)
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Chargement des contraventions impossible",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr")

    if (!needle) return rows

    return rows.filter((row) =>
      [
        row.numeroContravention,

        row.type,

        row.immatriculation,

        row.vehicule,

        row.client,

        row.commercial,

        PAYMENT_LABELS[row.statutPaiement],

        RECOVERY_LABELS[row.statutRecouvrement],
      ]

        .join(" ")

        .toLocaleLowerCase("fr")

        .includes(needle),
    )
  }, [rows, query])

  const visible = filtered.slice(
    (page - 1) * TABLE_PAGE_SIZE,

    page * TABLE_PAGE_SIZE,
  )

  useEffect(() => {
    setPage(1)
  }, [query])

  const beginCreate = () => {
    setEditingId(null)

    setDraft(emptyDraft())

    setError(null)
  }

  const beginEdit = (row: ContraventionDto) => {
    setEditingId(row.id)

    setDraft(draftFromRow(row))

    setError(null)
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!draft) return

    setSaving(true)

    setError(null)

    const payload = {
      ...draft,

      montant: Number(draft.montant),

      frais: Number(draft.frais || 0),

      montantRecouvre: Number(draft.montantRecouvre || 0),

      fraisRecouvres: Number(draft.fraisRecouvres || 0),

      vehiculeId: Number(draft.vehiculeId),

      clientId: draft.clientId ? Number(draft.clientId) : null,

      commercialId: draft.commercialId ? Number(draft.commercialId) : null,

      dateReglement: draft.dateReglement || null,

      dateRecouvrement: draft.dateRecouvrement || null,

      moyenPaiement: draft.moyenPaiement || null,

      numeroQuittance: draft.numeroQuittance || null,

      payeur: draft.payeur || null,

      clientImport: draft.clientId ? null : draft.clientImport.trim() || null,

      commercialImport: draft.commercialId
        ? null
        : draft.commercialImport.trim() || null,

      observation: draft.observation.trim() || null,
    }

    try {
      await apiFetch(
        editingId ? `/api/contraventions/${editingId}` : "/api/contraventions",

        {
          method: editingId ? "PUT" : "POST",

          body: payload,
        },
      )

      setDraft(null)

      setEditingId(null)

      await load()

      notifyDashboardMutation(
        editingId
          ? "Contravention modifiée avec succès."
          : "Contravention enregistrée avec succès.",
      )
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Enregistrement impossible",
      )
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: ContraventionDto) => {
    setDeleting(true)
    setError(null)

    try {
      await apiFetch(`/api/contraventions/${row.id}`, { method: "DELETE" })

      setConfirming(null)
      await load()

      notifyDashboardMutation("Contravention supprimée.")
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Suppression impossible",
      )
    } finally {
      setDeleting(false)
    }
  }

  const importCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget

    const file = input.files?.[0]

    if (!file) return

    setImporting(true)

    setError(null)

    try {
      const result = await apiFetch<{ created: number }>(
        "/api/contraventions/import-csv",

        {
          method: "POST",

          body: { csv: await readCsvFile(file) },
        },
      )

      await load()

      notifyDashboardMutation(
        `Import terminé : ${result.created} contravention(s) ajoutée(s).`,
      )
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Import CSV impossible")
    } finally {
      setImporting(false)

      input.value = ""
    }
  }

  const exportCsv = () => {
    const total = rows.reduce((sum, item) => sum + item.montant, 0)

    const paid = rows

      .filter((item) => item.statutPaiement === "PAYEE")

      .reduce((sum, item) => sum + item.montant, 0)

    const paidFees = rows

      .filter((item) => item.statutPaiement === "PAYEE")

      .reduce((sum, item) => sum + item.frais, 0)

    const outstanding = rows

      .filter((item) => item.statutPaiement === "IMPAYEE")

      .reduce((sum, item) => sum + item.montant, 0)

    const expectedRecovery = rows
      .filter(
        (item) => item.payeur === "HERTZ" && item.statutPaiement === "PAYEE",
      )

      .reduce((sum, item) => sum + item.montant + item.frais, 0)

    const received = rows.reduce((sum, item) => sum + item.montantRecouvre, 0)

    const noRecovery = rows

      .filter((item) => item.statutRecouvrement === "NON_LIEU")

      .reduce((sum, item) => sum + item.montant + item.frais, 0)

    const recoveredFees = rows.reduce(
      (sum, item) => sum + item.fraisRecouvres,
      0,
    )

    const pad = (values: Array<string | number>) => [
      ...values,

      ...Array(Math.max(0, CSV_HEADERS.length - values.length)).fill(""),
    ]

    const dataRows = rows.map((item, index) =>
      pad([
        index + 1,

        item.type,

        item.numeroContravention,

        csvDate(item.dateInfraction),

        `${item.montant.toLocaleString("fr-FR")} XOF`,

        item.immatriculation,

        item.marque,
        item.modele,

        item.client ?? item.clientImport ?? "",

        item.commercial ?? item.commercialImport ?? "",

        PAYMENT_LABELS[item.statutPaiement],

        csvDate(item.dateReglement),

        item.moyenPaiement
          ? (PAYMENT_METHOD_LABELS[item.moyenPaiement] ?? item.moyenPaiement)
          : "",

        item.numeroQuittance ?? "",

        item.payeur === "AGENT_DE_VENTE"
          ? "Agent de vente"
          : item.payeur === "HERTZ"
            ? "Hertz"
            : item.payeur === "CLIENT"
              ? "Client"
              : "",

        RECOVERY_LABELS[item.statutRecouvrement],

        csvDate(item.dateRecouvrement),

        PAYMENT_LABELS[item.statutPaiement],

        RECOVERY_LABELS[item.statutRecouvrement],
      ]),
    )

    downloadCsv("export-contraventions-anatt.csv", [
      pad([
        "CONTRENVENTIONS ROUTIERES",

        "",

        "Totale hors frais:",

        "Payée hors frais:",

        "Frais payé:",

        "Reste à payer:",
      ]),

      pad([
        "",
        "",
        money(total),
        money(paid),
        money(paidFees),
        money(outstanding),
      ]),

      pad([
        "",

        "",

        "Recouvrement attendu:",

        "Recouvrement effectué:",

        "Recouvrement non lieu:",

        "Frais recouvrés:",
      ]),

      pad([
        "",

        "",

        money(expectedRecovery),

        money(received),

        money(noRecovery),

        money(recoveredFees),
      ]),

      Array(CSV_HEADERS.length).fill(""),

      CSV_HEADERS,

      ...dataRows,
    ])
  }

  useEffect(() => {
    setPageActions(
      <div className="vehicle-csv-actions contravention-csv-actions">
        <button
          type="button"
          className="secondary vehicle-csv-button"
          title="Le modèle contient deux exemples ignorés automatiquement lors de l'import."
          onClick={() =>
            downloadCsv("modele-contraventions-anatt.csv", [
              CSV_TEMPLATE_HEADERS,
              ...CSV_TEMPLATE_EXAMPLES,
            ])
          }
        >
          Modèle CSV
        </button>
        <label className="secondary vehicle-csv-button cursor-pointer">
          {importing ? "Import…" : "Importer CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            disabled={importing}
            onChange={(event) => void importCsv(event)}
          />
        </label>
        <button
          type="button"
          className="primary small vehicle-csv-button"
          onClick={exportCsv}
        >
          Exporter CSV
        </button>
      </div>,
    )

    return () => setPageActions(null)
  }, [setPageActions, importing, rows])

  const updateDraft = <K extends keyof ContraventionDraft,>(
    key: K,

    value: ContraventionDraft[K],
  ) => setDraft((current) => (current ? { ...current, [key]: value } : current))

  return (
    <section className="data-card">
      <div className="data-toolbar">
        <div>
          <h2>Contraventions ANATT</h2>
          <p>{filtered.length} contravention(s)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="table-search"
            placeholder="Rechercher…"
            aria-label="Rechercher une contravention"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="primary small" onClick={beginCreate}>
            <Icon name="plus" size={17} /> Nouvelle contravention
          </button>
        </div>
      </div>

      {error && <p className="form-error whitespace-pre-line">{error}</p>}
      {loading ? (
        <p className="p-5 text-sm text-slate-500">Chargement…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>N° contravention</th>
                <th>Date</th>
                <th>Infraction</th>
                <th>Véhicule</th>
                <th>Client</th>
                <th>Montant</th>
                <th>Paiement</th>
                <th>Recouvrement</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.numeroContravention}</strong>
                  </td>
                  <td>{row.dateInfraction}</td>
                  <td>{row.type}</td>
                  <td>{row.immatriculation}</td>
                  <td>{row.client ?? row.clientImport ?? "—"}</td>
                  <td>{money(row.montant)}</td>
                  <td>{PAYMENT_LABELS[row.statutPaiement]}</td>
                  <td>{RECOVERY_LABELS[row.statutRecouvrement]}</td>
                  <td className="actions">
                    <button
                      type="button"
                      title="Voir les détails"
                      aria-label={`Voir les détails de ${row.numeroContravention}`}
                      onClick={() => setDetail(row)}
                    >
                      <Icon name="eye" size={17} />
                    </button>
                    <button
                      type="button"
                      title="Modifier"
                      aria-label={`Modifier ${row.numeroContravention}`}
                      onClick={() => beginEdit(row)}
                    >
                      <Icon name="edit" size={17} />
                    </button>
                    <button
                      type="button"
                      className="action-delete"
                      title="Supprimer"
                      aria-label={`Supprimer ${row.numeroContravention}`}
                      onClick={() => setConfirming(row)}
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center">
                    Aucune contravention.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <TablePagination page={page} total={filtered.length} onChange={setPage} />

      {confirming && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-contravention-title"
          >
            <p className="kicker">CONFIRMATION</p>
            <h2 id="delete-contravention-title">
              Supprimer cette contravention ?
            </h2>
            <p>
              La suppression de « {confirming.numeroContravention} » est
              définitive.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirming(null)}
                disabled={deleting}
              >
                Annuler
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void remove(confirming)}
                disabled={deleting}
              >
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <DetailModal
          title={detail.numeroContravention}
          subtitle={detail.type}
          fields={[
            {
              label: "Date de l’infraction",
              value: csvDate(detail.dateInfraction),
            },
            {
              label: "Véhicule",
              value: `${detail.immatriculation} · ${detail.vehicule}`,
            },
            { label: "Montant", value: money(detail.montant) },
            { label: "Frais", value: money(detail.frais) },
            {
              label: "Statut de paiement",
              value: PAYMENT_LABELS[detail.statutPaiement],
            },
            {
              label: "Date de règlement",
              value: csvDate(detail.dateReglement) || "—",
            },
            {
              label: "Moyen de paiement",
              value: detail.moyenPaiement
                ? (PAYMENT_METHOD_LABELS[detail.moyenPaiement] ??
                  detail.moyenPaiement)
                : "—",
            },
            { label: "N° de quittance", value: detail.numeroQuittance ?? "—" },
            {
              label: "Payeur",
              value:
                detail.payeur === "AGENT_DE_VENTE"
                  ? "Agent de vente"
                  : detail.payeur === "HERTZ"
                    ? "Hertz"
                    : detail.payeur === "CLIENT"
                      ? "Client"
                      : "—",
            },
            {
              label: "Client",
              value: detail.client ?? detail.clientImport ?? "—",
            },
            {
              label: "Agent de vente",
              value: detail.commercial ?? detail.commercialImport ?? "—",
            },
            {
              label: "Statut du recouvrement",
              value: RECOVERY_LABELS[detail.statutRecouvrement],
            },
            {
              label: "Date du recouvrement",
              value: csvDate(detail.dateRecouvrement) || "—",
            },
            { label: "Montant recouvré", value: money(detail.montantRecouvre) },
            { label: "Frais recouvrés", value: money(detail.fraisRecouvres) },
            { label: "Observation", value: detail.observation ?? "—" },
          ]}
          close={() => setDetail(null)}
        />
      )}

      {draft && (
        <div className="modal-backdrop" onClick={() => setDraft(null)}>
          <form
            className="modal location-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void save(event)}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Fermer"
              onClick={() => setDraft(null)}
              disabled={saving}
            >
              ×
            </button>
            <p className="kicker">HERTZ BÉNIN · ANATT</p>
            <h2>
              {editingId
                ? "Modifier la contravention"
                : "Nouvelle contravention"}
            </h2>
            <div className="modal-fields">
              <label>
                <span>N° de contravention</span>
                <input
                  required
                  maxLength={40}
                  value={draft.numeroContravention}
                  onChange={(e) =>
                    updateDraft("numeroContravention", e.target.value)
                  }
                />
              </label>
              <label>
                <span>Type d’infraction</span>
                <input
                  required
                  maxLength={150}
                  value={draft.type}
                  onChange={(e) => updateDraft("type", e.target.value)}
                />
              </label>
              <label>
                <span>Date de l’infraction</span>
                <input
                  required
                  type="date"
                  value={draft.dateInfraction}
                  onChange={(e) =>
                    updateDraft("dateInfraction", e.target.value)
                  }
                />
              </label>
              <label>
                <span>Véhicule</span>
                <select
                  required
                  value={draft.vehiculeId}
                  onChange={(e) => updateDraft("vehiculeId", e.target.value)}
                >
                  <option value="">Sélectionner un véhicule</option>
                  {options.vehicules
                    .filter((item) => item.statut !== "SORTIE_DEFINITIVE")
                    .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.immatriculation} · {item.vehicule}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Montant hors frais (XOF)</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={draft.montant}
                  onChange={(e) => updateDraft("montant", e.target.value)}
                />
              </label>
              <label>
                <span>Frais (XOF)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.frais}
                  onChange={(e) => updateDraft("frais", e.target.value)}
                />
              </label>
              <label>
                <span>Client connu</span>
                <select
                  value={draft.clientId}
                  onChange={(e) => updateDraft("clientId", e.target.value)}
                >
                  <option value="">Non renseigné / importé</option>
                  {options.clients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Agent de vente connu</span>
                <select
                  value={draft.commercialId}
                  onChange={(e) => updateDraft("commercialId", e.target.value)}
                >
                  <option value="">Non renseigné / importé</option>
                  {options.commerciaux.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Statut du paiement</span>
                <select
                  value={draft.statutPaiement}
                  onChange={(e) =>
                    updateDraft(
                      "statutPaiement",
                      e.target.value as ContraventionDraft["statutPaiement"],
                    )
                  }
                >
                  <option value="IMPAYEE">Impayée</option>
                  <option value="PAYEE">Payée</option>
                </select>
              </label>
              <label>
                <span>Date de règlement</span>
                <input
                  type="date"
                  required={draft.statutPaiement === "PAYEE"}
                  value={draft.dateReglement}
                  onChange={(e) => updateDraft("dateReglement", e.target.value)}
                />
              </label>
              <label>
                <span>Moyen de paiement</span>
                <select
                  value={draft.moyenPaiement}
                  onChange={(e) => updateDraft("moyenPaiement", e.target.value)}
                >
                  <option value="">Non renseigné</option>
                  <option value="ESPECES">Espèces</option>
                  <option value="CARTE_BANCAIRE">Carte bancaire</option>
                  <option value="CHEQUE">Chèque</option>
                  <option value="VIREMENT">Virement</option>
                  <option value="MTN_MOMO">MTN MoMo</option>
                  <option value="MOOV_MONEY">Moov Money</option>
                  <option value="MOBILE_MONEY">Autre mobile money</option>
                </select>
              </label>
              <label>
                <span>N° de quittance</span>
                <input
                  maxLength={60}
                  value={draft.numeroQuittance}
                  onChange={(e) =>
                    updateDraft("numeroQuittance", e.target.value)
                  }
                />
              </label>
              <label>
                <span>Payeur</span>
                <select
                  value={draft.payeur}
                  onChange={(e) => updateDraft("payeur", e.target.value)}
                >
                  <option value="">Non renseigné</option>
                  <option value="HERTZ">Hertz</option>
                  <option value="CLIENT">Client</option>
                  <option value="AGENT_DE_VENTE">Agent de vente</option>
                </select>
              </label>
              <label>
                <span>Statut du recouvrement</span>
                <select
                  value={draft.statutRecouvrement}
                  onChange={(e) =>
                    updateDraft(
                      "statutRecouvrement",
                      e.target
                        .value as ContraventionDraft["statutRecouvrement"],
                    )
                  }
                >
                  <option value="NON_EFFECTUE">Non effectué</option>
                  <option value="EFFECTUE">Effectué</option>
                  <option value="NON_LIEU">Non lieu</option>
                </select>
              </label>
              <label>
                <span>Date du recouvrement</span>
                <input
                  type="date"
                  value={draft.dateRecouvrement}
                  onChange={(e) =>
                    updateDraft("dateRecouvrement", e.target.value)
                  }
                />
              </label>
              <label>
                <span>Montant recouvré (XOF)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.montantRecouvre}
                  onChange={(e) =>
                    updateDraft("montantRecouvre", e.target.value)
                  }
                />
              </label>
              <label>
                <span>Frais recouvrés (XOF)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.fraisRecouvres}
                  onChange={(e) =>
                    updateDraft("fraisRecouvres", e.target.value)
                  }
                />
              </label>
              <label>
                <span>Observation</span>
                <input
                  maxLength={255}
                  value={draft.observation}
                  onChange={(e) => updateDraft("observation", e.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setDraft(null)}
                disabled={saving}
              >
                Annuler
              </button>
              <button type="submit" className="primary small" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
