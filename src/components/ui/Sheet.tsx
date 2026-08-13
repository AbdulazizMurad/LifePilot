import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

    // Lock the page behind the sheet without losing the reader's place.
    // `body { overflow: hidden }` alone does not hold on touch devices (iOS
    // Safari ignores it), so pin the body at its current offset and put the
    // scroll position back on close.
    const { scrollY } = window
    const body = document.body
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKey)
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.left = prev.left
      body.style.right = prev.right
      body.style.width = prev.width
      body.style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [open, onClose])

  if (!open) return null

  // Rendered at the document root so the sheet is always positioned against
  // the viewport, never trapped inside a transformed or scrolling ancestor.
  return createPortal(
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
    </div>,
    document.body,
  )
}
