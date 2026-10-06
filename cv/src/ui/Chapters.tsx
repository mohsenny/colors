import type { CSSProperties, ReactElement } from 'react'
import { LIFE } from '../life'
import { chapterHex } from './hex'

export interface ChaptersProps {
  open: boolean
  chapter: number | null
  onSelect(index: number): void
}

function Swatch({ hex }: { hex: string }): ReactElement {
  return <span className="lb-tray-swatch" style={{ '--lb-swatch': hex } as CSSProperties} aria-hidden="true" />
}

/**
 * The drawer behind the chapter chip, copied from Solar's Bodies: the six
 * chapters oldest first, each with its start and its key.
 */
export function Chapters({ open, chapter, onSelect }: ChaptersProps): ReactElement {
  const tab = open ? undefined : -1
  return (
    <div className={`lb-options lt-bodies${open ? ' is-open' : ''}`} aria-hidden={open ? undefined : 'true'}>
      {LIFE.chapters.map((c, i) => (
        <button
          key={c.id}
          type="button"
          className="lt-body-row"
          aria-pressed={chapter === i}
          tabIndex={tab}
          onClick={() => onSelect(i)}
        >
          <Swatch hex={chapterHex(i)} />
          <span className="lt-body-name">{c.name}</span>
          <span className="lt-body-kind cv-body-from">{c.from}</span>
          <span className="lt-body-key" aria-hidden="true">
            {i + 1}
          </span>
        </button>
      ))}
    </div>
  )
}
