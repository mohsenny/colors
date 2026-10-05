import type { ReactElement } from 'react'

const ROWS: ReadonlyArray<{ key: string; gesture: string; effect: string }> = [
  { key: 'drag', gesture: 'Drag', effect: 'turn the room' },
  { key: 'space', gesture: 'Space', effect: 'stop time' },
  { key: 'release', gesture: 'Double-click', effect: 'release, hold to aim' },
]

/** The three things that cannot be found by moving the mouse, and the way back. */
export function Legend(): ReactElement {
  return (
    <div className="lb-legend">
      {ROWS.map((row) => (
        <div key={row.key} className="lb-legend-row">
          <span className="lb-legend-gesture">{row.gesture}</span>
          <span className="lb-legend-effect">{row.effect}</span>
        </div>
      ))}
      <a className="lb-legend-row lb-legend-link" href="../">
        <span className="lb-legend-gesture">G</span>
        <span className="lb-legend-effect">Lightbox</span>
      </a>
    </div>
  )
}
