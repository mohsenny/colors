import type { ReactElement } from 'react'

type Row = { key: string; gesture: string; effect: string }

const ROWS: ReadonlyArray<Row> = [
  { key: 'drag', gesture: 'Drag', effect: 'turn the room' },
  { key: 'space', gesture: 'Space', effect: 'stop time' },
  { key: 'release', gesture: 'Double-click', effect: 'release, hold to aim' },
]

/** On a probe, the way off it is the thing to know. */
const RIDING: ReadonlyArray<Row> = [
  { key: 'drag', gesture: 'Drag', effect: 'look around' },
  { key: 'space', gesture: 'Space', effect: 'stop time' },
  { key: 'off', gesture: 'Esc or click', effect: 'step off' },
]

/** The three things that cannot be found by moving the mouse. */
export function Legend({ riding }: { riding: boolean }): ReactElement {
  return (
    <div className="lb-legend">
      {(riding ? RIDING : ROWS).map((row) => (
        <div key={row.key} className="lb-legend-row">
          <span className="lb-legend-gesture">{row.gesture}</span>
          <span className="lb-legend-effect">{row.effect}</span>
        </div>
      ))}
    </div>
  )
}
