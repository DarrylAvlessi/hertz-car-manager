import type { FormEvent } from "react"
import Icon from "@/shared/components/Icon"
import type { DashboardModule } from "@/shared/data/types"

export default function AddModal({
  module,
  close,
}: {
  module: DashboardModule
  close: () => void
}) {
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    close()
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={onSubmit}>
        <button
          className="modal-close"
          type="button"
          onClick={close}
          aria-label="Fermer"
        >
          <Icon name="close" />
        </button>
        <p className="kicker">NOUVEL ENREGISTREMENT</p>
        <h2>Ajouter · {module}</h2>
        <p>
          Renseignez les informations principales. Elles pourront être
          complétées ultérieurement.
        </p>
        <div className="modal-fields">
          <label>
            <span>Libellé / Nom</span>
            <input required placeholder="Saisir une valeur" />
          </label>
          <label>
            <span>Référence</span>
            <input required placeholder="Ex. HZ-2025-001" />
          </label>
          <label>
            <span>Date</span>
            <input type="date" required />
          </label>
          <label>
            <span>Statut initial</span>
            <select>
              <option>Actif</option>
              <option>En attente</option>
              <option>Brouillon</option>
            </select>
          </label>
        </div>
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
