import { Link } from "react-router-dom"
import { ROUTES } from "@/app/routes"

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f4f4f1] px-6 text-center">
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-neutral-500">
        Hertz Bénin · Erreur 404
      </p>
      <h1 className="mt-4 text-5xl font-black tracking-tight text-neutral-900">
        Page introuvable
      </h1>
      <p className="mt-4 max-w-md text-sm leading-6 text-neutral-600">
        La page demandée n’existe pas ou a été déplacée. Retournez à l’accueil
        ou à votre espace de gestion.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          to={ROUTES.home}
          className="bg-[#ffd100] px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-neutral-900"
        >
          Accueil
        </Link>
        <Link
          to={ROUTES.dashboard}
          className="border border-neutral-300 bg-white px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-neutral-700"
        >
          Dashboard
        </Link>
      </div>
    </main>
  )
}
