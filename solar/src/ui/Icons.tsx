import type { ReactElement } from 'react'
import type { EclipseType } from '../sky/eclipses'

function Icon({ children, flip = false }: { children: ReactElement | ReactElement[]; flip?: boolean }): ReactElement {
  return (
    <svg
      className={`lb-icon${flip ? ' is-flipped' : ''}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Pointing the way the clock will run. */
export function PlayIcon({ back = false }: { back?: boolean }): ReactElement {
  return (
    <Icon flip={back}>
      <path d="M4.4 2.6 11 7l-6.6 4.4Z" />
    </Icon>
  )
}

export function PauseIcon(): ReactElement {
  return (
    <Icon>
      <path d="M5.1 2.9v8.2" />
      <path d="M8.9 2.9v8.2" />
    </Icon>
  )
}

/** A step on, or back when flipped. */
export function StepIcon({ back = false }: { back?: boolean }): ReactElement {
  return (
    <Icon flip={back}>
      <path d="M5.4 3.3 9.1 7l-3.7 3.7" />
    </Icon>
  )
}

/** A long step, two of the one above. */
export function DoubleStepIcon({ back = false }: { back?: boolean }): ReactElement {
  return (
    <Icon flip={back}>
      <path d="M3.2 3.3 6.9 7l-3.7 3.7" />
      <path d="M7.1 3.3 10.8 7l-3.7 3.7" />
    </Icon>
  )
}

/** The plus, and the cross it becomes. */
export function PlusIcon({ open }: { open: boolean }): ReactElement {
  return (
    <svg
      className={`lb-icon lb-plus${open ? ' is-open' : ''}`}
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
      <path d="M7 3.2v7.6M3.2 7h7.6" />
    </svg>
  )
}

/** A solar eclipse is the Sun, gold; a lunar one the Moon, copper as the Earth's shadow turns it. The marks on the tape are the same two, small. */
export function EclipseIcon({ type }: { type: EclipseType }): ReactElement {
  return (
    <svg
      className={`lb-icon sl-eclipse-icon is-${type}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
    >
      {type === 'solar' ? (
        <>
          <circle cx="7" cy="7" r="2.5" fill="currentColor" />
          <path
            d="M7 1.4v1.2M7 11.4v1.2M1.4 7h1.2M11.4 7h1.2M3 3l.85.85M10.15 10.15l.85.85M3 11l.85-.85M10.15 3.85 11 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      ) : (
        <path d="M5 2.4A5 5 0 1 0 11.6 9 5 5 0 0 1 5 2.4Z" fill="currentColor" />
      )}
    </svg>
  )
}
