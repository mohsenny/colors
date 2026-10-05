import type { MouseEvent, ReactElement } from 'react'

type App = 'lightbox' | 'lattice' | 'solar'

const APPS: ReadonlyArray<{ id: App; name: string }> = [
  { id: 'lightbox', name: 'Lightbox' },
  { id: 'lattice', name: 'Lattice' },
  { id: 'solar', name: 'Solar' },
]

/** Where another app lives, seen from this one: Lightbox at the root, the others a folder down. */
function hrefOf(from: App, to: App): string {
  return (from === 'lightbox' ? '' : '../') + (to === 'lightbox' ? '' : `${to}/`)
}

/**
 * When the other app is the page just behind or just ahead in this tab's
 * history, step to it rather than load it again, so the browser hands back
 * the room as it was left: the same sheets and pins, the same body and light
 * in flight. Switching back and forth then never piles up history either.
 * Without the Navigation API this is a plain link, and each app's hash is
 * still what it arrives with.
 */
function stepAcross(e: MouseEvent<HTMLAnchorElement>): void {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  // Not in every browser yet, whatever the DOM types say.
  const nav = window.navigation as Navigation | undefined
  const here = nav?.currentEntry
  if (!nav || !here) return
  const href = e.currentTarget.href
  const target = new URL(href).pathname
  const entries = nav.entries()
  for (const entry of [entries[here.index - 1], entries[here.index + 1]]) {
    if (entry?.url && new URL(entry.url).pathname === target) {
      e.preventDefault()
      void nav.traverseTo(entry.key).finished?.catch(() => {
        window.location.href = href
      })
      return
    }
  }
}

/**
 * The three names in the top-left corner, and the only way across. The one
 * you are in is strong, the others are faint, and clicking one goes there.
 * Same weight for all, so the words never move when the shades trade places.
 */
export function Title({ active }: { active: App }): ReactElement {
  return (
    <nav className="lb-title" aria-label="Instruments">
      {APPS.map((app) =>
        app.id === active ? (
          <span key={app.id} className="lb-title-name" aria-current="page">
            {app.name}
          </span>
        ) : (
          <a key={app.id} className="lb-title-name" href={hrefOf(active, app.id)} onClick={stepAcross}>
            {app.name}
          </a>
        ),
      )}
    </nav>
  )
}
