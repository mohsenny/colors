import type { ReactElement } from 'react'
import { MASS_LOG, SIZE_LOG } from '../app/instrument'

export interface OptionsProps {
  open: boolean
  massLog: number
  sizeLog: number
  hole: boolean
  onMass(v: number): void
  onSize(v: number): void
  /** A slider was let go: the room may re-frame on the body. */
  onSettle(): void
}

function Slider(props: {
  id: string
  label: string
  value: number
  range: readonly [number, number]
  open: boolean
  onChange(v: number): void
  onSettle(): void
}): ReactElement {
  const { id, label, value, range, open, onChange, onSettle } = props
  return (
    <div className="lb-opt-row">
      <label className="lb-opt-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="lt-slider"
        type="range"
        min={range[0]}
        max={range[1]}
        step={0.01}
        value={value}
        tabIndex={open ? undefined : -1}
        onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
        onPointerUp={onSettle}
        onKeyUp={onSettle}
      />
    </div>
  )
}

/** The drawer behind the plus: the body by hand. */
export function Options(props: OptionsProps): ReactElement {
  const { open, massLog, sizeLog, hole, onMass, onSize, onSettle } = props
  return (
    <div className={`lb-options${open ? ' is-open' : ''}`} aria-hidden={open ? undefined : 'true'}>
      <Slider id="lt-mass" label="Mass" value={massLog} range={MASS_LOG} open={open} onChange={onMass} onSettle={onSettle} />
      <Slider
        id="lt-size"
        label={hole ? 'Horizon' : 'Size'}
        value={sizeLog}
        range={SIZE_LOG}
        open={open}
        onChange={onSize}
        onSettle={onSettle}
      />
    </div>
  )
}
