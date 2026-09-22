import type { ReactElement } from 'react'
import { SLIDE_COUNT_MAX, SLIDE_COUNT_MIN } from '../core/constants'

export interface OptionsProps {
  /** Rendered either way. Closed it is inert and not in the tab order. */
  open: boolean
  /** Sheets currently on the stage. */
  slideCount: number
  /** Lamp colour bias, -1 warm to +1 cool. */
  warmth: number
  onSlideCountChange(count: number): void
  onWarmthChange(warmth: number): void
}

const WARMTHS: ReadonlyArray<{ label: string; value: number }> = [
  { label: 'Warm', value: -1 },
  { label: 'Neutral', value: 0 },
  { label: 'Cool', value: 1 },
]

/**
 * The drawer behind the plus, above the dock.
 *
 * Everything in the dock proper is something you reach for while looking at the
 * stage: play, scrub, reroll, blend. Everything in here is a decision about the
 * instrument itself, made once and then left alone. Keeping the two apart is
 * what stops the dock turning into a control panel, which is the failure mode
 * for a thing that is meant to read as an object rather than as software.
 *
 * Rendered even when closed, and hidden with `visibility` rather than
 * `display`, so the panel has a height to animate from and the controls inside
 * keep their identity across an open and close.
 */
export function Options(props: OptionsProps): ReactElement {
  const { open, slideCount, warmth, onSlideCountChange, onWarmthChange } = props
  const atMin = slideCount <= SLIDE_COUNT_MIN
  const atMax = slideCount >= SLIDE_COUNT_MAX

  return (
    <div className={`lb-options${open ? ' is-open' : ''}`} aria-hidden={open ? undefined : 'true'}>
      <div className="lb-opt-row">
        <span className="lb-opt-label" id="lb-opt-sheets">
          Sheets
        </span>
        <div className="lb-stepper" role="group" aria-labelledby="lb-opt-sheets">
          <button
            type="button"
            className="lb-step-btn"
            aria-label="One sheet fewer"
            disabled={atMin}
            tabIndex={open ? undefined : -1}
            onClick={() => onSlideCountChange(slideCount - 1)}
          >
            <Glyph d="M3.5 7h7" />
          </button>
          {/*
            Tabular figures, or the panel jogs sideways between 8 and 11 and the
            two buttons move out from under the pointer that is stepping them.
          */}
          <span className="lb-step-value" aria-live="polite">
            {slideCount}
          </span>
          <button
            type="button"
            className="lb-step-btn"
            aria-label="One sheet more"
            disabled={atMax}
            tabIndex={open ? undefined : -1}
            onClick={() => onSlideCountChange(slideCount + 1)}
          >
            <Glyph d="M7 3.5v7M3.5 7h7" />
          </button>
        </div>
      </div>

      <div className="lb-opt-row">
        <span className="lb-opt-label" id="lb-opt-light">
          Light
        </span>
        <div
          className="lb-seg lb-seg-3"
          role="group"
          aria-labelledby="lb-opt-light"
          data-index={WARMTHS.findIndex((w) => w.value === warmth)}
        >
          <span className="lb-seg-indicator" aria-hidden="true" />
          {WARMTHS.map((w) => (
            <button
              key={w.label}
              type="button"
              className="lb-seg-btn"
              aria-pressed={warmth === w.value}
              tabIndex={open ? undefined : -1}
              onClick={() => onWarmthChange(w.value)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Glyph({ d }: { d: string }): ReactElement {
  return (
    <svg
      className="lb-icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  )
}
