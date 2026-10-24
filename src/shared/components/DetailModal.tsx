import Icon from "./Icon"

export interface DetailField {
  label: string

  value: string
}

export default function DetailModal({
  title,

  subtitle,

  fields,

  close,
}: {
  title: string

  subtitle?: string

  fields: DetailField[]

  close: () => void
}) {
  return (
    <div className="modal-backdrop">
      <div
        className="modal detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-modal-title"
      >
        <button
          className="modal-close"
          type="button"
          onClick={close}
          aria-label="Fermer"
        >
          <Icon name="close" />
        </button>
        <p className="kicker">DÉTAILS</p>
        <h2 id="detail-modal-title">{title}</h2>
        {subtitle && <p className="detail-subtitle">{subtitle}</p>}
        <dl className="detail-fields">
          {fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value || "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
