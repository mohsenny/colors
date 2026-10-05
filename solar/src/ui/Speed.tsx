import type { ReactElement } from 'react'
import { TOP, rateName } from '../app/time'

export interface SpeedProps {
  open: boolean
  rung: number
  /** Which way the clock runs, at the same speed. */
  onTurn(rung: number): void
  onSelect(rung: number): void
}

const RUNGS = Array.from({ length: TOP + 1 }, (_, i) => i)

/** The drawer behind the speed: which way the clock runs, and every speed, one click each. */
export function Speed({ open, rung, onTurn, onSelect }: SpeedProps): ReactElement {
  const back = rung < 0
  const tab = open ? undefined : -1
  return (
    <div className={`lb-options sl-speed${open ? ' is-open' : ''}`} aria-hidden={open ? undefined : 'true'}>
      <div className="lb-seg sl-way" role="group" aria-label="Which way the clock runs" data-mode={back ? 'back' : 'on'}>
        <span className="lb-seg-indicator" aria-hidden="true" />
        <button type="button" className="lb-seg-btn" aria-pressed={!back} tabIndex={tab} onClick={() => onTurn(Math.abs(rung))}>
          Forward
        </button>
        {/* Real time has no backward: turning round from it starts at the next speed up. */}
        <button
          type="button"
          className="lb-seg-btn"
          aria-pressed={back}
          tabIndex={tab}
          onClick={() => onTurn(-Math.max(1, Math.abs(rung)))}
        >
          Backward
        </button>
      </div>
      {RUNGS.map((i) => (
        <button
          key={i}
          type="button"
          className="lt-body-row"
          aria-pressed={Math.abs(rung) === i}
          tabIndex={tab}
          onClick={() => onSelect(back && i > 0 ? -i : i)}
        >
          <span className="lt-body-name">{rateName(i)}</span>
        </button>
      ))}
    </div>
  )
}
