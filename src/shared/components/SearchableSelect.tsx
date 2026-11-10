import { useId, useMemo, useRef, useState } from "react"
import type { KeyboardEvent } from "react"

export interface SearchableSelectOption {
  value: string
  label: string
  searchText?: string
  disabled?: boolean
}

interface SearchableSelectProps {
  value: string
  options: SearchableSelectOption[]
  onChange: (value: string) => void
  placeholder: string
  emptyOptionLabel?: string
  required?: boolean
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim()
}

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  emptyOptionLabel,
  required = false,
  disabled = false,
  className,
  ariaLabel,
}: SearchableSelectProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const selected = options.find((option) => option.value === value)
  const filteredOptions = useMemo(() => {
    const needle = normalize(query)
    return options.filter((option) => {
      if (!needle) return true
      return normalize(`${option.label} ${option.searchText ?? ""}`).includes(needle)
    })
  }, [options, query])
  const selectableOptions = [
    ...(emptyOptionLabel ? [{ value: "", label: emptyOptionLabel }] : []),
    ...filteredOptions.filter((option) => !option.disabled),
  ]
  const activeOption = selectableOptions[activeIndex]
  const optionId = (optionValue: string) =>
    `${listId}-option-${optionValue ? encodeURIComponent(optionValue) : "empty"}`

  const choose = (option: SearchableSelectOption) => {
    onChange(option.value)
    setQuery("")
    setOpen(false)
    inputRef.current?.setCustomValidity("")
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const direction = event.key === "ArrowDown" ? 1 : -1
      setActiveIndex((index) =>
        selectableOptions.length
          ? (index + direction + selectableOptions.length) %
            selectableOptions.length
          : 0,
      )
    } else if (event.key === "Enter" && open && selectableOptions.length) {
      event.preventDefault()
      choose(selectableOptions[activeIndex] ?? selectableOptions[0]!)
    } else if (event.key === "Escape" && open) {
      event.preventDefault()
      setOpen(false)
      setQuery("")
      inputRef.current?.setCustomValidity("")
    }
  }

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery)
    setOpen(true)
    setActiveIndex(0)
    onChange("")
    inputRef.current?.setCustomValidity(
      nextQuery ? "Sélectionnez une option dans la liste." : "",
    )
  }

  return (
    <div
      className={`searchable-select${open ? " searchable-select--open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
          setQuery("")
          inputRef.current?.setCustomValidity("")
        }
      }}
    >
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeOption ? optionId(activeOption.value) : undefined}
        autoComplete="off"
        disabled={disabled}
        required={required && !value}
        className={className}
        placeholder={placeholder}
        value={open ? query : selected?.label ?? ""}
        onFocus={() => {
          setQuery("")
          setActiveIndex(0)
          setOpen(true)
        }}
        onClick={() => {
          if (!open) {
            setQuery("")
            setActiveIndex(0)
            setOpen(true)
          }
        }}
        onChange={(event) => updateQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        onInvalid={(event) => {
          if (!value) {
            event.currentTarget.setCustomValidity("Choisissez une option dans la liste.")
          }
        }}
      />
      {open && !disabled && (
        <div className="searchable-select__list" id={listId} role="listbox">
          {emptyOptionLabel && (
            <button
              type="button"
              id={optionId("")}
              role="option"
              aria-selected={!value}
              className={`searchable-select__option${activeIndex === 0 ? " is-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose({ value: "", label: emptyOptionLabel })}
            >
              {emptyOptionLabel}
            </button>
          )}
          {filteredOptions.map((option) => {
            const optionIndex = selectableOptions.findIndex(
              (item) => item.value === option.value,
            )
            return (
              <button
                type="button"
                key={option.value}
                id={optionId(option.value)}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                className={`searchable-select__option${optionIndex === activeIndex ? " is-active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.label}
              </button>
            )
          })}
          {filteredOptions.length === 0 && (
            <p className="searchable-select__empty">Aucun résultat</p>
          )}
        </div>
      )}
    </div>
  )
}
