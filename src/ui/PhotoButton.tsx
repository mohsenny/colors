import type { ReactElement } from 'react'

/**
 * Save, in every dock: the picture on the screen, without its words and
 * controls. An arrow into a tray rather than a camera, which is heavier than
 * the marks beside it and, in a room you can turn, reads as the view.
 */
export function PhotoButton({ onPress }: { onPress: () => void }): ReactElement {
  return (
    <button type="button" className="lb-btn" aria-label="Save a picture" onClick={onPress}>
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
        <path d="M7 2.4v6.4" />
        <path d="M4.4 6.3 7 8.9l2.6-2.6" />
        <path d="M2.6 9.6v.9c0 .7.5 1.2 1.2 1.2h6.4c.7 0 1.2-.5 1.2-1.2v-.9" />
      </svg>
    </button>
  )
}
