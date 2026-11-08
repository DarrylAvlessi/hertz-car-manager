const DASHBOARD_MUTATION_EVENT = "hertz:dashboard-mutation"

export function notifyDashboardMutation(message: string): void {
  window.dispatchEvent(
    new CustomEvent(DASHBOARD_MUTATION_EVENT, { detail: message }),
  )
}

export function dashboardMutationEventName(): string {
  return DASHBOARD_MUTATION_EVENT
}
