import type { ReactElement } from 'react'

/*
 * Lucide's play, pause, file-text and x, in its 24 box and 2 stroke, as in
 * glyphs.ts (ISC, Copyright (c) 2026 Lucide Icons and Contributors). x comes
 * from Feather (MIT, Copyright (c) 2013-present Cole Bemis).
 */
function Icon({ children }: { children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <svg
      className="lb-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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
      <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
    </Icon>
  )
}

export function PauseIcon(): ReactElement {
  return (
    <Icon>
      <rect x="14" y="3" width="5" height="18" rx="1" />
      <rect x="5" y="3" width="5" height="18" rx="1" />
    </Icon>
  )
}

/** A page of text: the CV as text. */
export function PageIcon(): ReactElement {
  return (
    <Icon>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </Icon>
  )
}

/** A cross, for putting the paper away. */
export function CloseIcon(): ReactElement {
  return (
    <Icon>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}
