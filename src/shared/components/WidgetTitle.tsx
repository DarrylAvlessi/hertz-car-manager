import Icon from "./Icon"

export default function WidgetTitle({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string
  subtitle: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="widget-title">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {action && (
        <button onClick={onAction}>
          {action} {onAction && <Icon name="arrow" size={15} />}
        </button>
      )}
    </div>
  )
}
