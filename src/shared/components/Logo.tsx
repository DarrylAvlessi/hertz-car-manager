export default function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`logo ${light ? "light" : ""}`}>
      <img src="/hertz-benin-logo.jpg" alt="Hertz Bénin" />
    </span>
  )
}
