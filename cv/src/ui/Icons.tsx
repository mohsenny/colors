import type { ReactElement } from 'react'

function Icon({ children }: { children: ReactElement | ReactElement[] }): ReactElement {
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
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function PlayIcon(): ReactElement {
  return (
    <Icon>
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

/** A page with its corner turned and two lines on it: the CV as text. */
export function PageIcon(): ReactElement {
  return (
    <Icon>
      <path d="M3.2 1.6h5l2.6 2.6v8.2H3.2Z" />
      <path d="M8.2 1.6v2.6h2.6" />
      <path d="M5.2 7h3.6" />
      <path d="M5.2 9.6h3.6" />
    </Icon>
  )
}
