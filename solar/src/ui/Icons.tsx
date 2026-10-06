import type { ReactElement } from 'react'

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
