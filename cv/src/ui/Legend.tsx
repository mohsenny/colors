import type { ReactElement } from 'react'

type Row = { key: string; gesture: string; effect: string }

const ROWS: ReadonlyArray<Row> = [
  { key: 'scroll', gesture: 'Scroll', effect: 'move through the years' },
  { key: 'click', gesture: 'Click', effect: 'read a chapter' },
  { key: 't', gesture: 'T', effect: 'open the CV as text' },
]

/** The three things that cannot be found by moving the mouse. Out of the way while the paper is. */
export function Legend({ away }: { away: boolean }): ReactElement {
  return (
    <div className={`lb-legend${away ? ' is-away' : ''}`}>
      {ROWS.map((row) => (
        <div key={row.key} className="lb-legend-row">
          <span className="lb-legend-gesture">{row.gesture}</span>
          <span className="lb-legend-effect">{row.effect}</span>
        </div>
      ))}
    </div>
  )
}
