import { Fragment } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { LIFE } from '../life'
import { chapterHex, chapterOf, crossingHex } from './hex'

export interface ChaptersProps {
  open: boolean
  chapter: number | null
  crossing: number | null
  onSelect(index: number): void
  onCrossing(index: number): void
}

/** The crossings, under the later of their two chapters, the way Solar's moons sit under their planet. */
const UNDER = new Map<number, number[]>()
for (const [i, x] of LIFE.crossings.entries()) {
  const at = Math.max(chapterOf(x.a), chapterOf(x.b))
  UNDER.set(at, [...(UNDER.get(at) ?? []), i])
}

function Swatch({ hex }: { hex: string }): ReactElement {
  return <span className="lb-tray-swatch" style={{ '--lb-swatch': hex } as CSSProperties} aria-hidden="true" />
}

/**
 * The drawer behind the chapter chip, copied from Solar's Bodies: the eight
 * chapters oldest first, each with its start and its key, and the two
 * crossings under the chapter that made them.
 */
export function Chapters({ open, chapter, crossing, onSelect, onCrossing }: ChaptersProps): ReactElement {
  const tab = open ? undefined : -1
  return (
    <div className={`lb-options lt-bodies${open ? ' is-open' : ''}`} aria-hidden={open ? undefined : 'true'}>
      {LIFE.chapters.map((c, i) => (
        <Fragment key={c.id}>
          <button
            type="button"
            className="lt-body-row"
            aria-pressed={crossing === null && chapter === i}
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
          {UNDER.get(i)?.length ? (
            <div className="lt-moons" role="group" aria-label={`Crossings of ${c.name}`}>
              {UNDER.get(i)?.map((x) => (
                <button
                  key={x}
                  type="button"
                  className="lt-moon"
                  aria-pressed={crossing === x}
                  tabIndex={tab}
                  onClick={() => onCrossing(x)}
                >
                  <Swatch hex={crossingHex(LIFE.crossings[x] as (typeof LIFE.crossings)[number])} />
                  {LIFE.crossings[x]?.name}
                </button>
              ))}
            </div>
          ) : null}
        </Fragment>
      ))}
    </div>
  )
}
