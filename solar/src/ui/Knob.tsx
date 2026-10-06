import { useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { notch, speedLabel, speedSaid } from '../app/time'

export interface KnobProps {
  /** -1 to 1: below 0 the clock runs back, 0 is real time. */
  dial: number
  onDial(dial: number): void
}

/** Pixels of drag from the middle of the knob to an end. */
const PX = 160
/** A hand that has moved less than this is still clicking, not turning. */
const SLOP_PX = 3
/** How far the knob turns either way from the middle, degrees. */
const SWEEP = 135
/** The dial's centre and the radius of its arc, in its 26 px box. */
const C = 13
const R = 10.5

const KEYS = new Map<string, (dial: number) => number>([
  ['ArrowRight', (d) => notch(d, 1)],
  ['ArrowUp', (d) => notch(d, 1)],
  ['ArrowLeft', (d) => notch(d, -1)],
  ['ArrowDown', (d) => notch(d, -1)],
  ['Home', () => -1],
  ['End', () => 1],
])

/** A point `r` out from the centre, `deg` clockwise from straight up. */
function at(deg: number, r: number): string {
  const a = (deg * Math.PI) / 180
  return `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`
}

/** The arc clockwise from `from` to `to`. */
function arc(from: number, to: number): string {
  return `M ${at(from, R)} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${at(to, R)}`
}

/**
 * The speed: a knob resting on real time, forward to the right and back to
 * the left, and the speed it is at. Dragging right or up turns it forward;
 * the arrow keys stop at the round speeds; a double-click is real time again.
 */
export function Knob({ dial, onDial }: KnobProps): ReactElement {
  const grip = useRef<{ id: number; x: number; y: number; dial: number; turning: boolean } | null>(null)
  const [turning, setTurning] = useState(false)
  const deg = dial * SWEEP
  const end = (): void => {
    grip.current = null
    setTurning(false)
  }

  return (
    <div
      className={`sl-knob${turning ? ' is-turning' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label="Speed"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={dial}
      aria-valuetext={speedSaid(dial)}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        grip.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dial, turning: false }
      }}
      onPointerMove={(e) => {
        const g = grip.current
        if (!g || g.id !== e.pointerId) return
        const along = e.clientX - g.x - (e.clientY - g.y)
        if (!g.turning) {
          if (Math.abs(along) < SLOP_PX) return
          g.turning = true
          setTurning(true)
        }
        onDial(g.dial + along / PX)
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onDial(0)}
      onKeyDown={(e) => {
        const to = KEYS.get(e.key)
        if (!to) return
        e.preventDefault()
        onDial(to(dial))
      }}
    >
      <svg className="sl-knob-dial" viewBox="0 0 26 26" aria-hidden="true" focusable="false">
        <path className="sl-knob-track" d={arc(-SWEEP, SWEEP)} />
        {dial !== 0 && <path className="sl-knob-turn" d={dial > 0 ? arc(0, deg) : arc(deg, 0)} />}
        <circle className="sl-knob-cap" cx={C} cy={C} r={6.5} />
        <path className="sl-knob-hand" d={`M ${at(deg, 1.5)} L ${at(deg, 5.2)}`} />
      </svg>
      <span className="sl-knob-speed" aria-hidden="true">
        {speedLabel(dial)}
      </span>
    </div>
  )
}
