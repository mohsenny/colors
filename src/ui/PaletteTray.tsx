import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'

export interface PinnedColor {
  id: number
  hex: string
  locked: boolean
  /** A live slide's colour, or a colour that was sampled off the film and frozen. */
  kind: 'slide' | 'mix'
  /**
   * How many sheets were stacked where a sample was taken, and always 1 for a
   * slide pin. The row needs it because a frozen colour off one sheet and a
   * frozen crossing are different things to have saved, and the hex alone
   * cannot say which.
   */
  sheets: number
}

export interface PaletteTrayProps {
  pinned: PinnedColor[]
  onUnpin(id: number): void
  onSelect(id: number): void
  onCopy(hex: string): void
}

/**
 * How long the tick stays. Long enough to be certain it happened, short enough
 * that the row is offering to copy again before you have thought about it.
 */
const COPIED_MS = 1100
const LEAVE_MS = 240

/** Removal is the parent's decision, so the exit animation needs the departed entry kept. */
interface Ghost {
  color: PinnedColor
  /** Where it sat before it went, so it collapses in place instead of jumping to the end. */
  index: number
  /** Absolute deadline, so a second unpin cannot cancel the first one's cleanup. */
  expires: number
}

interface Flash {
  id: number
  hex: string
  /** Re-copying the same swatch must restart the flash, so the state has to differ. */
  n: number
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function LockGlyph(): ReactElement {
  return (
    <svg
      className="lb-tray-lock"
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Locked"
    >
      <rect x="2" y="4.4" width="6" height="4.6" rx="1" />
      <path d="M3.5 4.4V3.2a1.5 1.5 0 0 1 3 0v1.2" />
    </svg>
  )
}

/** Two overlapping sheets: how a sampled crossing says what it is. */
/**
 * The mark on a frozen colour, drawn as the thing that was sampled: one sheet,
 * or sheets crossing.
 *
 * Both kinds sit in the same list as live slide colours, and a frozen colour
 * behaves differently (it has no slide to select and it survives a regenerate),
 * so the row has to say so. Drawing the count rather than the kind means the
 * glyph is the same idea in both cases and there is nothing extra to learn.
 */
function SampleGlyph({ sheets }: { sheets: number }): ReactElement {
  const crossed = sheets > 1
  return (
    <svg
      className="lb-tray-lock"
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
      role="img"
      aria-label={crossed ? `Sampled where ${sheets} slides overlap` : 'Sampled colour'}
    >
      {crossed ? (
        <>
          <rect x="1" y="1" width="5.2" height="5.2" rx="0.8" />
          <rect x="3.8" y="3.8" width="5.2" height="5.2" rx="0.8" />
        </>
      ) : (
        <rect x="2.4" y="2.4" width="5.2" height="5.2" rx="0.8" />
      )}
    </svg>
  )
}

/**
 * A clipboard and a tick, in one box, crossfading.
 *
 * A clipboard rather than the usual two offset sheets, because two offset
 * sheets is already taken: it is the mark on a sampled crossing, sitting one
 * slot to the left in the same row. Two glyphs that differ only in their
 * offset, 6px apart at 11px tall, is a puzzle rather than a control.
 *
 * Both states stay mounted and the opacity swaps rather than the element being
 * replaced: a swap restarts the button's layout and the row twitches on the
 * frame it happens. It also lets the tick grow into place as the clipboard
 * shrinks out of it, which is the part that reads as "taken" rather than as
 * "a different icon is here now".
 */
function CopyIcon({ done }: { done: boolean }): ReactElement {
  return (
    <svg
      className={`lb-tray-copy-icon${done ? ' is-done' : ''}`}
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <g className="lb-tray-copy-mark">
        <path d="M4.4 2.2H3.1a1.3 1.3 0 0 0-1.3 1.3v6a1.3 1.3 0 0 0 1.3 1.3h5.8a1.3 1.3 0 0 0 1.3-1.3v-6a1.3 1.3 0 0 0-1.3-1.3H7.6" />
        <rect x="4.1" y="1" width="3.8" height="2.4" rx="0.9" />
      </g>
      <path className="lb-tray-copy-tick" d="M2.2 6.3 4.9 9l4.9-5.4" />
    </svg>
  )
}

function UnpinIcon(): ReactElement {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.2 2.2 7.8 7.8" />
      <path d="M7.8 2.2 2.2 7.8" />
    </svg>
  )
}

export function PaletteTray(props: PaletteTrayProps): ReactElement | null {
  const { pinned, onUnpin, onSelect, onCopy } = props
  const [flash, setFlash] = useState<Flash | null>(null)
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  const previous = useRef<PinnedColor[]>(pinned)
  const flashCount = useRef(0)

  useEffect(() => {
    const before = previous.current
    previous.current = pinned
    const deadline = Date.now() + LEAVE_MS
    const gone = before
      .map((color, index) => ({ color, index, expires: deadline }))
      .filter((g) => !pinned.some((p) => p.id === g.color.id))

    setGhosts((current) => {
      // A re-pinned id is live again, so its ghost must go immediately.
      const kept = current.filter((g) => !pinned.some((p) => p.id === g.color.id))
      const added = prefersReducedMotion()
        ? []
        : gone.filter((g) => !kept.some((k) => k.color.id === g.color.id))
      if (added.length === 0 && kept.length === current.length) return current
      return [...kept, ...added]
    })
  }, [pinned])

  // One timer for the nearest deadline. Per-ghost timers cancelled by the next
  // unpin used to leave the earlier ghost mounted for good, which also kept the
  // tray from disappearing when the last colour was unpinned.
  useEffect(() => {
    if (ghosts.length === 0) return
    const soonest = Math.min(...ghosts.map((g) => g.expires))
    // Sweeping by the captured deadline (not the clock at fire time) guarantees the
    // batch it was scheduled for is removed, so the effect always gets to re-run.
    const timer = window.setTimeout(
      () => {
        setGhosts((current) => {
          const next = current.filter((g) => g.expires > soonest)
          return next.length === current.length ? current : next
        })
      },
      Math.max(0, soonest - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [ghosts])

  useEffect(() => {
    if (flash === null) return
    const timer = window.setTimeout(() => setFlash(null), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  if (pinned.length === 0 && ghosts.length === 0) return null

  /** Which row is currently showing a tick, if any. One at a time. */
  const copied = flash === null ? null : flash.id

  const entries: Array<{ color: PinnedColor; leaving: boolean }> = pinned.map((color) => ({
    color,
    leaving: false,
  }))
  for (const ghost of ghosts) {
    const at = Math.min(ghost.index, entries.length)
    entries.splice(at, 0, { color: ghost.color, leaving: true })
  }

  return (
    <div className="lb-tray">
      <ul className="lb-tray-list" aria-label="Pinned colours">
        {entries.map(({ color, leaving }) => (
          <li
            key={leaving ? `ghost-${color.id}` : color.id}
            className={`lb-tray-item${leaving ? ' is-leaving' : ''}`}
            aria-hidden={leaving ? true : undefined}
            // A collapsing entry still holds three buttons: without `inert` they stay
            // tabbable for 240 ms inside an aria-hidden subtree.
            inert={leaving}
            style={{ '--lb-swatch': color.hex } as CSSProperties}
          >
            {/* The chip is the colour, not a control. Copying is the copy button's
                job and there is no second, invisible way to do it. */}
            <span className="lb-tray-swatch" aria-hidden="true" />
            {color.kind === 'mix' ? (
              // Nothing to select: a sample is a value, and the sheets that
              // made it have drifted since. Even a one-sheet sample no longer
              // matches the slide it came off. A button that goes nowhere is
              // worse than no button, so a sample is plain text.
              <span className="lb-tray-hex is-static">{color.hex.toUpperCase()}</span>
            ) : (
              <button
                type="button"
                className="lb-tray-hex"
                aria-label={`Select the slide for ${color.hex}`}
                onClick={() => onSelect(color.id)}
              >
                {color.hex.toUpperCase()}
              </button>
            )}
            {color.kind === 'mix' ? (
              <SampleGlyph sheets={color.sheets} />
            ) : color.locked ? (
              <LockGlyph />
            ) : (
              <span className="lb-tray-lock-spacer" />
            )}
            <button
              type="button"
              className="lb-tray-copy"
              // The label does not change with the tick. A control that renames
              // itself mid-press reads to a screen reader as a different
              // control, and the confirmation is announced by the status line
              // below instead, which is what a status line is for.
              aria-label={`Copy ${color.hex}`}
              data-done={copied === color.id}
              onClick={() => {
                onCopy(color.hex)
                flashCount.current += 1
                setFlash({ id: color.id, hex: color.hex, n: flashCount.current })
              }}
            >
              <CopyIcon done={copied === color.id} />
            </button>
            <button
              type="button"
              className="lb-tray-unpin"
              aria-label={`Unpin ${color.hex}`}
              onClick={() => onUnpin(color.id)}
            >
              <UnpinIcon />
            </button>
          </li>
        ))}
      </ul>
      <span className="lb-sr-only" role="status">
        {flash === null ? '' : `Copied ${flash.hex}`}
      </span>
    </div>
  )
}
