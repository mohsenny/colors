import type { ReactElement } from 'react'
import { dayLabel, minuteLabel } from '../app/time'
import type { Eclipse, EclipseSteps, EclipseType } from '../sky/eclipses'
import { StepIcon } from './Icons'

export interface OptionsProps {
  open: boolean
  solar: EclipseSteps
  lunar: EclipseSteps
  onWatch(e: Eclipse): void
  onStep(type: EclipseType, way: 1 | -1): void
}

interface RowProps extends Pick<OptionsProps, 'open' | 'onWatch' | 'onStep'> {
  type: EclipseType
  steps: EclipseSteps
}

/**
 * The eclipse of one type the clock is at, lit, or else the next, between a
 * step back and a step on. Each goes there and the drawer stays, so the
 * eclipses can be stepped through one after another to either end of the
 * clock's range.
 */
function Row({ type, steps, open, onWatch, onStep }: RowProps): ReactElement {
  const { e, at, back, on } = steps
  const tab = open ? undefined : -1
  return (
    <div className="lb-opt-row">
      <span className="lb-opt-label" aria-hidden="true">
        {type === 'solar' ? 'Solar' : 'Lunar'}
      </span>
      <div className="lb-stepper" role="group" aria-label={`${type === 'solar' ? 'Solar' : 'Lunar'} eclipses`}>
        <button
          type="button"
          className="lb-step-btn"
          aria-label={`Previous ${type} eclipse`}
          disabled={!back}
          tabIndex={tab}
          onClick={() => onStep(type, -1)}
        >
          <StepIcon back />
        </button>
        <button
          type="button"
          className="sl-eclipse"
          aria-current={at || undefined}
          aria-label={e ? `Watch the ${e.kind.toLowerCase()} ${type} eclipse of ${dayLabel(e.peak)}` : undefined}
          disabled={!e}
          tabIndex={tab}
          onClick={() => e && onWatch(e)}
        >
          <span className="sl-eclipse-kind">{e?.kind ?? ''}</span>
          <span className="sl-eclipse-when">{e ? `${dayLabel(e.peak)}, ${minuteLabel(e.peak)}` : 'None in range'}</span>
        </button>
        <button
          type="button"
          className="lb-step-btn"
          aria-label={`Next ${type} eclipse`}
          disabled={!on}
          tabIndex={tab}
          onClick={() => onStep(type, 1)}
        >
          <StepIcon />
        </button>
      </div>
    </div>
  )
}

/** The drawer behind the plus: the solar and the lunar eclipses, to step through. */
export function Options({ open, solar, lunar, onWatch, onStep }: OptionsProps): ReactElement {
  return (
    <div className={`lb-options${open ? ' is-open' : ''}`} aria-hidden={open ? undefined : 'true'}>
      <Row type="solar" steps={solar} open={open} onWatch={onWatch} onStep={onStep} />
      <Row type="lunar" steps={lunar} open={open} onWatch={onWatch} onStep={onStep} />
    </div>
  )
}
