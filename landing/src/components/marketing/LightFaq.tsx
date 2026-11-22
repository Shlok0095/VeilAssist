import { useId, useState } from 'react'

type Item = { q: string; a: string }

export function LightFaq({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<number | null>(0)
  const baseId = useId()

  return (
    <div className="lm-faq">
      {items.map((item, i) => {
        const isOpen = open === i
        const panelId = `${baseId}-panel-${i}`
        return (
          <div key={item.q} className="lm-faq__item reveal">
            <button
              type="button"
              className="lm-faq__btn"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span>{item.q}</span>
              <span className={`lm-faq__chev${isOpen ? ' open' : ''}`} aria-hidden>
                ▼
              </span>
            </button>
            <div
              id={panelId}
              className="lm-faq__answer"
              aria-hidden={!isOpen}
              style={{ maxHeight: isOpen ? '400px' : '0', paddingTop: isOpen ? undefined : 0 }}
            >
              <div className="lm-faq__answer-inner">{item.a}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
