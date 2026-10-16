import type { ReactNode } from "react"

const icons: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </>
  ),
  sellers: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5" />
    </>
  ),
  car: (
    <>
      <path d="m5 11 2-5h10l2 5M3 13a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5H3v-5Z" />
      <path d="M5 18v2M19 18v2M6 14h2M16 14h2" />
    </>
  ),
  rental: (
    <>
      <path d="M4 4h16v16H4zM8 2v4M16 2v4M4 9h16" />
      <path d="m9 15 2 2 4-5" />
    </>
  ),
  booking: (
    <>
      <path d="M6 2v3M18 2v3M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" />
      <path d="m8 14 2 2 5-5" />
    </>
  ),
  client: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  stats: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="m15 15 6 6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  logout: (
    <>
      <path d="M10 17l5-5-5-5M15 12H3M15 4h6v16h-6" />
    </>
  ),
  print: (
    <>
      <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5h20v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
}

export default function Icon({
  name,
  size = 20,
}: {
  name: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  )
}
