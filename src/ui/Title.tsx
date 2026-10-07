import { useEffect, useState } from 'react'
import type { FocusEvent, MouseEvent, PointerEvent, ReactElement } from 'react'
import { APPS, hrefOf } from './pages'
import type { App } from './pages'

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

/** The id of a page's line, which its name is described by. */
function lineOf(app: App): string {
  return `lb-title-line-${app}`
}

/**
 * The four names in the top-left corner, and the only way across. The one
 * you are in is strong, the others are faint, and clicking one goes there.
 * Same weight for all, so the words never move when the shades trade places.
 *
 * A mouse resting on a name, or the keys tabbing to it, brings up a line under
 * the row saying what that page is, the one you are in too, so it can be
 * reached by Tab. Along the row the line changes with the name, and only
 * leaving the row takes it away. A finger taps and goes there, and brings up
 * nothing. Each name is described by its line, and the lines are hidden from
 * a screen reader otherwise, so it hears each one once.
 */
export function Title({ active }: { active: App }): ReactElement {
  // The page whose line is up. Kept while the line fades, so the words go with it.
  const [said, setSaid] = useState<App>(active)
  const [telling, setTelling] = useState(false)
  const tell = (app: App): void => {
    setSaid(app)
    setTelling(true)
  }

  // Back from history the page is as it was left, the line up for a name the
  // pointer is no longer on. Focus the keys left on a name still holds it.
  useEffect(() => {
    const back = (e: PageTransitionEvent): void => {
      if (e.persisted && !document.querySelector('.lb-title-name:focus-visible')) setTelling(false)
    }
    window.addEventListener('pageshow', back)
    return () => window.removeEventListener('pageshow', back)
  }, [])

  return (
    <nav
      className={telling ? 'lb-title is-telling' : 'lb-title'}
      aria-label="Pages"
      onPointerLeave={() => setTelling(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setTelling(false)
      }}
    >
      {APPS.map((app) => {
        const name = {
          className: 'lb-title-name',
          'aria-describedby': lineOf(app.id),
          onPointerEnter: (e: PointerEvent<HTMLElement>) => {
            if (e.pointerType === 'mouse') tell(app.id)
          },
          // A click can leave focus on a name too, and that tells nothing.
          onFocus: (e: FocusEvent<HTMLElement>) => {
            if (e.currentTarget.matches(':focus-visible')) tell(app.id)
          },
        }
        return app.id === active ? (
          <span key={app.id} {...name} tabIndex={0} aria-current="page">
            {app.name}
          </span>
        ) : (
          <a key={app.id} {...name} href={hrefOf(active, app.id)} onClick={stepAcross}>
            {app.name}
          </a>
        )
      })}
      <span className="lb-title-lines" aria-hidden="true">
        {APPS.map((app) => (
          <span key={app.id} id={lineOf(app.id)} hidden={app.id !== said}>
            {app.line}
          </span>
        ))}
      </span>
    </nav>
  )
}
