interface Option<T extends string | number> {
  value: T
  label: string
}

interface Props<T extends string | number> {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
}

export function Segmented<T extends string | number>({ options, value, onChange }: Props<T>) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          data-active={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
