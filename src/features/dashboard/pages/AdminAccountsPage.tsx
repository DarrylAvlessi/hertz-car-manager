import { useEffect, useState } from "react"
import { useAuth } from "@/features/auth/AuthContext"
import {
  createAdminAccount,
  fetchAdminAccounts,
} from "@/shared/data/adminService"
import type {
  AdminAccount,
  CreateAdminAccountInput,
} from "@/shared/data/adminService"
import type { AuthRole } from "@/shared/data/types"

const EMPTY_FORM: CreateAdminAccountInput = {
  nom: "",
  prenom: "",
  email: "",
  password: "",
  role: "responsable",
}

const ROLE_LABELS: Record<AuthRole, string> = {
  responsable: "Responsable",
  admin: "Administrateur",
  superadmin: "Super administrateur",
}

export default function AdminAccountsPage() {
  const { user } = useAuth()
  const [admins, setAdmins] = useState<AdminAccount[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    if (user?.role !== "superadmin") {
      setLoading(false)
      return () => {
        active = false
      }
    }

    fetchAdminAccounts()
      .then((accounts) => {
        if (active) setAdmins(accounts)
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Impossible de charger les comptes administrateurs.",
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user?.role])

  const updateForm = <K extends keyof CreateAdminAccountInput>(
    key: K,
    value: CreateAdminAccountInput[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const created = await createAdminAccount({
        ...form,
        email: form.email.trim().toLowerCase(),
      })
      setAdmins((current) =>
        [...current, created].sort((a, b) =>
          `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, "fr"),
        ),
      )
      setForm(EMPTY_FORM)
      setSuccess(`Le compte de ${created.prenom} ${created.nom} a été créé.`)
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible de créer le compte administrateur.",
      )
    } finally {
      setSaving(false)
    }
  }

  if (user?.role !== "superadmin") {
    return (
      <section className="data-card">
        <p className="form-error" role="alert">
          Cette page est réservée aux super administrateurs.
        </p>
      </section>
    )
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="kicker">ADMINISTRATION</p>
          <h1>Comptes administrateurs</h1>
          <p>Créez des comptes et attribuez leur niveau d’accès.</p>
        </div>
      </div>

      <section className="data-card admin-account-card">
        <div className="data-toolbar">
          <div>
            <h2>Créer un compte</h2>
            <p>Le mot de passe est haché avant son enregistrement.</p>
          </div>
        </div>
        <form className="admin-account-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>Prénom</span>
            <input
              required
              maxLength={80}
              value={form.prenom}
              onChange={(event) => updateForm("prenom", event.target.value)}
            />
          </label>
          <label>
            <span>Nom</span>
            <input
              required
              maxLength={80}
              value={form.nom}
              onChange={(event) => updateForm("nom", event.target.value)}
            />
          </label>
          <label>
            <span>Adresse e-mail</span>
            <input
              required
              type="email"
              maxLength={120}
              autoComplete="email"
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
            />
          </label>
          <label>
            <span>Mot de passe temporaire</span>
            <input
              required
              type="password"
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => updateForm("password", event.target.value)}
            />
          </label>
          <label>
            <span>Rôle</span>
            <select
              value={form.role}
              onChange={(event) =>
                updateForm("role", event.target.value as AuthRole)
              }
            >
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-account-submit">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Création…" : "Créer le compte"}
            </button>
          </div>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="admin-account-success" role="status">{success}</p>}
      </section>

      <section className="data-card admin-account-card">
        <div className="data-toolbar">
          <div>
            <h2>Comptes existants</h2>
            <p>{admins.length} compte(s)</p>
          </div>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-neutral-500">Chargement…</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Adresse e-mail</th>
                  <th>Rôle</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td>{admin.prenom} {admin.nom}</td>
                    <td>{admin.email}</td>
                    <td>{ROLE_LABELS[admin.role]}</td>
                    <td>{admin.active ? "Actif" : "Désactivé"}</td>
                  </tr>
                ))}
                {admins.length === 0 && (
                  <tr>
                    <td colSpan={4}>Aucun compte administrateur.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
