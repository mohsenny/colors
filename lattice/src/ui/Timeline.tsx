import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactElement } from 'react'

export interface TimelineProps {
  /** 0..1 playhead position inside the retained window. 1 is the live edge. */
  position: number
  /** 0..1 how much of the window has been recorded yet. */
  filled: number
  /** Paused or scrubbed: the scrubber becomes prominent. */
  expanded: boolean
  onScrub(position: number): void
  onScrubStart(): void
  onScrubEnd(): void
}

/** Keys the native range input acts on. Anything else must not open a scrub gesture. */
const SCRUB_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

/** Below this the playhead is at the live edge for all practical purposes. */
const LIVE_EPSILON = 0.001

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function Timeline(props: TimelineProps): ReactElement {
  const { expanded, onScrub, onScrubStart, onScrubEnd } = props
  const position = clamp01(props.position)
  const filled = clamp01(props.filled)

  // A gesture can begin with a pointer and end with a key (or the reverse), so the
  // open/closed state has to be tracked rather than inferred per handler.
  const scrubbing = useRef(false)

  const begin = (): void => {
    if (scrubbing.current) return
    scrubbing.current = true
    onScrubStart()
  }

  const finish = (): void => {
    if (!scrubbing.current) return
    scrubbing.current = false
    onScrubEnd()
  }

  // A pointer released outside the input never reaches a React handler on it, and
  // the input keeps focus so `blur` does not fire either. Without a window-level
  // end the gesture stays open and playback never resumes.
  const latestFinish = useRef(finish)
  useEffect(() => {
    latestFinish.current = finish
  })
  useEffect(() => {
    const end = (): void => latestFinish.current()
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  const atLive = position >= 1 - LIVE_EPSILON

  // The recorded span abuts the live edge (the ring fills backwards from now), and
  // `position` runs over the recorded frames only, so it has to be mapped into that
  // span. Otherwise the playhead sits left of the recorded region for the first 15 s
  // and after every ring-clearing resize.
  const style = {
    '--lb-tl-pos': `${(1 - filled + position * filled) * 100}%`,
    '--lb-tl-rec-left': `${(1 - filled) * 100}%`,
    '--lb-tl-rec-width': `${filled * 100}%`,
  } as CSSProperties

  return (
    <div className={`lb-timeline${expanded ? ' is-expanded' : ''}`} style={style}>
      <input
        className="lb-timeline-input"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={position}
        aria-label="Scrub recent history"
        aria-valuetext={atLive ? 'live' : 'recent history'}
        onChange={(e) => {
          begin()
          onScrub(clamp01(e.currentTarget.valueAsNumber))
        }}
        onPointerDown={begin}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={(e) => {
          if (SCRUB_KEYS.has(e.key)) begin()
        }}
        onKeyUp={(e) => {
          if (SCRUB_KEYS.has(e.key)) finish()
        }}
        onBlur={finish}
      />
      <div className="lb-timeline-visual" aria-hidden="true">
        <span className="lb-timeline-track" />
        <span className="lb-timeline-recorded" />
        <span className="lb-timeline-head" />
      </div>
    </div>
  )
}
