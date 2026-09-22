import type { ReactElement } from 'react'

const ROWS: ReadonlyArray<{ key: string; gesture: string; effect: string }> = [
  { key: 'click', gesture: 'Click', effect: 'stop a sheet' },
  { key: 'keep', gesture: 'Double-click', effect: 'take the colour' },
  { key: 'space', gesture: 'Space', effect: 'stop time' },
]

/**
 * Three lines in the bottom-left corner, opposite the wordmark, naming the only
 * three things that cannot be discovered by moving the mouse.
 *
 * They stay. An earlier version retired each line the first time you did the
 * thing it described, which is a clever idea and a bad one: the gestures are
 * used minutes apart, the list is the only place they are written down, and
 * taking one away the moment it is used means the one time you want to check
 * is the one time it is gone. Quiet enough to ignore beats clever enough to
 * vanish.
 */
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
