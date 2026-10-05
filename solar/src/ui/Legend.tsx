import type { ReactElement } from 'react'

type Row = { key: string; gesture: string; effect: string }

const ROWS: ReadonlyArray<Row> = [
  { key: 'drag', gesture: 'Drag', effect: 'look around' },
  { key: 'scroll', gesture: 'Scroll', effect: 'zoom' },
  { key: 'click', gesture: 'Click', effect: 'look at it' },
  { key: 'double', gesture: 'Double-click', effect: 'go there' },
]

/** The things that cannot be found by moving the mouse. */
export function Legend(): ReactElement {
  return (
    <div className="lb-legend">
      {ROWS.map((row) => (
        <div key={row.key} className="lb-legend-row">
          <span className="lb-legend-gesture">{row.gesture}</span>
          <span className="lb-legend-effect">{row.effect}</span>
        </div>
      ))}
    </div>
  )
}
