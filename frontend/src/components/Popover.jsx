import { useEffect, useRef, useState } from 'react'

export default function Popover({ trigger, children, align = 'right', panelClassName = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {trigger(() => setOpen((o) => !o), open)}
      {open && (
        <div className={`absolute z-50 mt-2 ${align === 'right' ? 'right-0' : 'left-0'} ${panelClassName}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
