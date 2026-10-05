import type { ReactElement } from 'react'
import { dayLabel, minuteLabel } from '../app/time'
import type { Eclipse } from '../sky/eclipses'
import { CREDIT } from '../render/maps'

export interface OptionsProps {
  open: boolean
  solar: Eclipse | null
  lunar: Eclipse | null
  live: boolean
  onWatch(e: Eclipse): void
  onNow(): void
}

function Next({ label, e, open, onWatch }: { label: string; e: Eclipse | null; open: boolean; onWatch(e: Eclipse): void }): ReactElement {
  return (
    <button
      type="button"
      className="sl-next"
      disabled={!e}
      tabIndex={open ? undefined : -1}
      onClick={() => e && onWatch(e)}
      aria-label={e ? `Watch the next ${label.toLowerCase()}: ${e.kind.toLowerCase()}, ${dayLabel(e.peak)}` : undefined}
    >
      <span className="lb-opt-label">{label}</span>
      <span className="sl-next-kind">{e?.kind ?? ''}</span>
      <span className="sl-next-when">{e ? `${dayLabel(e.peak)}, ${minuteLabel(e.peak)}` : 'None in range'}</span>
    </button>
  )
}

/** The drawer behind the plus: the next eclipses, the way back to now, and where the pictures come from. */
export function Options({ open, solar, lunar, live, onWatch, onNow }: OptionsProps): ReactElement {
  return (
    <div className={`lb-options sl-options${open ? ' is-open' : ''}`} aria-hidden={open ? undefined : 'true'}>
      <Next label="Solar eclipse" e={solar} open={open} onWatch={onWatch} />
      <Next label="Lunar eclipse" e={lunar} open={open} onWatch={onWatch} />
      <button type="button" className="sl-now" disabled={live} tabIndex={open ? undefined : -1} onClick={onNow}>
        Back to now
      </button>
      <p className="sl-credit">{CREDIT}</p>
    </div>
  )
}
