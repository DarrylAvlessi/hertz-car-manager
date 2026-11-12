import { useState } from "react"
import type { FormEvent } from "react"

import { useAuth } from "@/features/auth/AuthContext"

import Icon from "@/shared/components/Icon"

interface ProfileModalProps {
  close: () => void

  saved: () => void
}

export default function ProfileModal({ close, saved }: ProfileModalProps) {
  const { user, updateProfile } = useAuth()

  const [firstName, setFirstName] = useState(user?.firstName ?? "")

  const [lastName, setLastName] = useState(user?.lastName ?? "")

  const [email, setEmail] = useState(user?.email ?? "")

  const [currentPassword, setCurrentPassword] = useState("")

  const [newPassword, setNewPassword] = useState("")

  const [confirmPassword, setConfirmPassword] = useState("")

  const [error, setError] = useState("")

  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError("")

    if (newPassword && newPassword !== confirmPassword) {
      setError("Les nouveaux mots de passe ne correspondent pas.")

      return
    }

    setSaving(true)

    try {
      await updateProfile({
        firstName,

        lastName,

        email,

        currentPassword: newPassword ? currentPassword : undefined,

        newPassword: newPassword || undefined,
      })

      saved()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "La mise à jour du profil a échoué.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!saving) close()
      }}
    >
      <form
        className="modal profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close"
          type="button"
          onClick={close}
          aria-label="Fermer"
          disabled={saving}
        >
          <Icon name="close" />
        </button>
        <p className="kicker">MON COMPTE</p>
        <h2 id="profile-modal-title">Modifier le profil</h2>
        <p>Les nouveaux identifiants seront enregistrés sur votre compte.</p>
        <div className="modal-fields">
          <label>
            <span>Prénom</span>
            <input
              autoComplete="given-name"
              maxLength={80}
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>
          <label>
            <span>Nom</span>
            <input
              autoComplete="family-name"
              maxLength={80}
              required
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </label>
          <label className="profile-modal-full">
            <span>Adresse e-mail</span>
            <input
              autoComplete="email"
              maxLength={120}
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Mot de passe actuel</span>
            <input
              autoComplete="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label>
            <span>Nouveau mot de passe</span>
            <input
              autoComplete="new-password"
              minLength={8}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <label className="profile-modal-full">
            <span>Confirmer le nouveau mot de passe</span>
            <input
              autoComplete="new-password"
              minLength={8}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          <p className="profile-modal-full">
            Laissez les champs de mot de passe vides pour le conserver. Sa
            modification nécessite le mot de passe actuel.
          </p>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            onClick={close}
            disabled={saving}
          >
            Annuler
          </button>
          <button className="primary small" type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  )
}
