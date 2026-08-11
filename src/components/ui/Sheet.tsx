import { useEffect, type ReactNode } from 'react'
import { IconX } from './icons'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/** Bottom sheet modal — the primary way we present forms on mobile. */
export function Sheet({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && (
          <div className="between" style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 20 }}>{title}</h2>
            <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="Close">
              <IconX width={18} height={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
