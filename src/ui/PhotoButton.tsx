import type { ReactElement } from 'react'

/**
 * Save, in every dock: the picture on the screen, without its words and
 * controls. Lucide's camera, copied from lucide-static 1.53.0 (ISC, Copyright
 * (c) 2026 Lucide Icons and Contributors), its line thickened to the docks'
 * 1.5 px.
 */
export function PhotoButton({ onPress }: { onPress: () => void }): ReactElement {
  return (
    <button type="button" className="lb-btn" aria-label="Save a picture" onClick={onPress}>
      <svg
        className="lb-icon"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.57"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
        <circle cx="12" cy="13" r="3" />
      </svg>
    </button>
  )
}
