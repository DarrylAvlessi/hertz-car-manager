import { useEffect, useMemo, useState } from "react"
import DetailModal from "@/shared/components/DetailModal"
import Icon from "@/shared/components/Icon"
import { apiFetch } from "@/shared/api/client"
import TablePagination, { TABLE_PAGE_SIZE } from "../components/TablePagination"
import DatePeriodFilter, { matchesDatePeriod, type DatePeriod } from "../components/DatePeriodFilter"

type Sale = {
  id: number
  numeroVente: string
  vehiculeId: number
  acheteurId: number
  dateVente: string
  prixVente: number
  devise: string
  fraisVente: number
  motifVente: string
  etatVehicule: string
  kilometrageVente: number
  canalVente: string | null
  statutPaiement: string
  dateRemiseVehicule: string | null
  referenceCession: string | null
  statut: string
  dateAnnulation: string | null
  motifAnnulation: string | null
  factureId: number | null
  mouvementId: number
  commercialId: number | null
  administrateurId: number
  observation: string | null
  dateCreation: string
}
type VehicleOption = { id: number; immatriculation: string }
type NamedOption = { id: number; nom: string }
const formatMoney = (amount: number, currency: string) => `${amount.toLocaleString("fr-FR")} ${currency}`

export default function VehicleSalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [clients, setClients] = useState<NamedOption[]>([])
  const [commercials, setCommercials] = useState<NamedOption[]>([])
  const [query, setQuery] = useState("")
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("all")
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Sale | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const [saleRows, vehicleRows, clientRows, commercialRows] = await Promise.all([
        apiFetch<Sale[]>("/api/vehicules/ventes"),
        apiFetch<VehicleOption[]>("/api/vehicules"),
        apiFetch<NamedOption[]>("/api/clients"),
        apiFetch<NamedOption[]>("/api/commerciaux"),
      ])
      setSales(saleRows)
      setVehicles(vehicleRows)
      setClients(clientRows)
      setCommercials(commercialRows)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement des ventes impossible")
    }
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return sales.filter((sale) => {
      const vehicle = vehicles.find((item) => item.id === sale.vehiculeId)?.immatriculation ?? ""
      const buyer = clients.find((item) => item.id === sale.acheteurId)?.nom ?? ""
      return matchesDatePeriod(sale.dateVente, datePeriod) &&
        (!needle || `${sale.numeroVente} ${vehicle} ${buyer} ${sale.statut} ${sale.statutPaiement}`.toLowerCase().includes(needle))
    })
  }, [sales, vehicles, clients, query, datePeriod])
  const visible = filtered.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE)
  useEffect(() => { setPage(1) }, [query, datePeriod])
  useEffect(() => {
    if (page > Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE))) setPage(1)
  }, [page, filtered.length])

  return <section className="data-card">
    <div className="data-toolbar"><div><h2>Ventes de véhicules</h2><p>{filtered.length} ventes affichées</p></div>
      <div><input className="table-search" placeholder="Rechercher une vente…" aria-label="Rechercher une vente" value={query} onChange={(event) => setQuery(event.target.value)} />
        <DatePeriodFilter value={datePeriod} onChange={setDatePeriod} /></div>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="table-scroll"><table><thead><tr><th>N° vente</th><th>Véhicule</th><th>Acheteur</th><th>Date de vente</th><th>Prix</th><th>Paiement</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>{visible.map((sale) => <tr key={sale.id}>
        <td><strong>{sale.numeroVente}</strong></td>
        <td>{vehicles.find((item) => item.id === sale.vehiculeId)?.immatriculation ?? `#${sale.vehiculeId}`}</td>
        <td>{clients.find((item) => item.id === sale.acheteurId)?.nom ?? `#${sale.acheteurId}`}</td>
        <td>{sale.dateVente}</td><td>{formatMoney(sale.prixVente, sale.devise)}</td><td>{sale.statutPaiement}</td><td>{sale.statut}</td>
        <td className="actions"><button title="Voir les détails" aria-label={`Détails de la vente ${sale.numeroVente}`} onClick={() => setDetail(sale)}><Icon name="eye" size={17} /></button></td>
      </tr>)}</tbody>
    </table></div>
    <TablePagination page={page} total={filtered.length} onChange={setPage} />
    {detail && <DetailModal title={detail.numeroVente} subtitle={vehicles.find((item) => item.id === detail.vehiculeId)?.immatriculation ?? `Véhicule #${detail.vehiculeId}`} fields={[
      { label: "Acheteur", value: clients.find((item) => item.id === detail.acheteurId)?.nom ?? `#${detail.acheteurId}` },
      { label: "Vendeur", value: commercials.find((item) => item.id === detail.commercialId)?.nom ?? "—" },
      { label: "Date de vente", value: detail.dateVente },
      { label: "Prix de vente", value: formatMoney(detail.prixVente, detail.devise) },
      { label: "Frais", value: formatMoney(detail.fraisVente, detail.devise) },
      { label: "Motif", value: detail.motifVente },
      { label: "État", value: detail.etatVehicule },
      { label: "Kilométrage", value: `${detail.kilometrageVente.toLocaleString("fr-FR")} km` },
      { label: "Canal", value: detail.canalVente ?? "—" },
      { label: "Paiement", value: detail.statutPaiement },
      { label: "Remise du véhicule", value: detail.dateRemiseVehicule ?? "—" },
      { label: "Référence de cession", value: detail.referenceCession ?? "—" },
      { label: "Statut", value: detail.statut },
      { label: "Facture", value: detail.factureId ? `#${detail.factureId}` : "—" },
      { label: "Observation", value: detail.observation ?? "—" },
    ]} close={() => setDetail(null)} />}
  </section>
}
