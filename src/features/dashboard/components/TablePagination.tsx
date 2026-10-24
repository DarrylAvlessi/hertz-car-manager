import Icon from "@/shared/components/Icon"

export const TABLE_PAGE_SIZE = 15

export default function TablePagination({
  page,
  total,
  onChange,
}: {
  page: number
  total: number
  onChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE))
  if (pageCount <= 1) return null
  const visiblePages = new Set([1, pageCount])
  for (let pageNumber = Math.max(2, page - 1); pageNumber <= Math.min(pageCount - 1, page + 1); pageNumber += 1) {
    visiblePages.add(pageNumber)
  }
  const pageNumbers = [...visiblePages].sort((left, right) => left - right)

  return (
    <div className="table-pagination">
      <span>
        Page {page} sur {pageCount}
      </span>
      <div>
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Page précédente"
        >
          <Icon name="arrow-left" size={15} />
        </button>
        {pageNumbers.map((pageNumber, index) => (
          <span className="table-pagination-page" key={pageNumber}>
            {index > 0 && pageNumber - pageNumbers[index - 1]! > 1 && <span aria-hidden="true">…</span>}
            <button
              type="button"
              className={pageNumber === page ? "active" : undefined}
              onClick={() => onChange(pageNumber)}
              aria-label={`Aller à la page ${pageNumber}`}
              aria-current={pageNumber === page ? "page" : undefined}
            >
              {pageNumber}
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Page suivante"
        >
          <Icon name="arrow-right" size={15} />
        </button>
      </div>
    </div>
  )
}
