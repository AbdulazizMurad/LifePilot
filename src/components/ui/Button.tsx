import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'soft' | 'danger' | 'default'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  block?: boolean
  size?: 'sm' | 'md'
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'default',
  block,
  size = 'md',
  loading,
  children,
  className = '',
  disabled,
  ...rest
}: Props) {
  const cls = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    block ? 'btn--block' : '',
    size === 'sm' ? 'btn--sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" /> : children}
    </button>
  )
}
