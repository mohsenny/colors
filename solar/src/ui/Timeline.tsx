import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactElement } from 'react'

export interface TimelineProps {
  /** 0..1 where the clock is on the tape. 1 is its newest moment. */
  position: number
  /** 0..1 how much of the tape has been watched yet. */
  filled: number
  /** Eclipse peaks on the tape, as places like `position`. */
  marks: number[]
  /** Paused or scrubbed: the scrubber becomes prominent. */
  expanded: boolean
  /** The moment at the head, read out by assistive tech. */
  moment: string
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

/** More marks than this are a texture, not places to find. */
const MARKS_MAX = 24
/** A drag this close to a mark lands on it. */
const SNAP_PX = 6

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Copied from Lattice, with the marks added and the head kept under the pointer while the tape is still filling. */
export function Timeline(props: TimelineProps): ReactElement {
  const { expanded, moment, onScrub, onScrubStart, onScrubEnd } = props
  const position = clamp01(props.position)
  const filled = clamp01(props.filled)
  const marks = props.marks.length <= MARKS_MAX ? props.marks : []

  // A gesture can begin with a pointer and end with a key (or the reverse), so the
  // open/closed state has to be tracked rather than inferred per handler.
  const scrubbing = useRef(false)
  // Snapping helps a hand find a mark. For the arrow keys it would be a trap.
  const pointer = useRef(false)

  const begin = (): void => {
    if (scrubbing.current) return
    scrubbing.current = true
    onScrubStart()
  }

  const finish = (): void => {
    pointer.current = false
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

  // The watched part abuts the newest end and grows leftwards, so a place on the
  // tape maps into that part of the track, for the native input as for the head.
  const place = (p: number): number => 1 - filled + p * filled

  const style = {
    '--lb-tl-pos': `${place(position) * 100}%`,
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
        value={place(position)}
        aria-label="Scrub back through the last two minutes"
        aria-valuetext={moment}
        onChange={(e) => {
          begin()
          const input = e.currentTarget
          const v = input.valueAsNumber
          let p = filled > 0 ? clamp01((v - (1 - filled)) / filled) : 1
          if (pointer.current) {
            let near = SNAP_PX / Math.max(1, input.getBoundingClientRect().width)
            for (const m of marks) {
              const d = Math.abs(place(m) - v)
              if (d < near) {
                near = d
                p = m
              }
            }
          }
          onScrub(p)
        }}
        onPointerDown={() => {
          pointer.current = true
          begin()
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={(e) => {
          if (SCRUB_KEYS.has(e.key)) {
            pointer.current = false
            begin()
          }
        }}
        onKeyUp={(e) => {
          if (SCRUB_KEYS.has(e.key)) finish()
        }}
        onBlur={finish}
      />
      <div className="lb-timeline-visual" aria-hidden="true">
        <span className="lb-timeline-track" />
        <span className="lb-timeline-recorded" />
        {marks.map((m, i) => (
          <span key={i} className="sl-mark" style={{ left: `${place(m) * 100}%` }} />
        ))}
        <span className="lb-timeline-head" />
      </div>
    </div>
  )
}
