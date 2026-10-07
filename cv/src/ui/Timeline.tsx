import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'

/** A chapter's place on the tape, and what its tip says. */
export interface Mark {
  at: number
  name: string
  /** The start year, or for Growing up the place. */
  from: string
  hex: string
}

export interface TimelineProps {
  /** Playing: the tape steps back to its narrow width, as Solar's does. */
  expanded: boolean
  marks: Mark[]
  /** Where the clock is, read out by assistive tech. */
  moment: string
  /** Hands the instrument the tape and its input, which it moves every frame. */
  attachTape(el: HTMLElement | null, input: HTMLInputElement | null): void
  onScrub(position: number): void
  onScrubEnd(): void
  onStep(way: 1 | -1): void
  onFirst(): void
  onLast(): void
}

/** A drag this close to a mark lands on it, and a pointer this close says which chapter it is. */
const SNAP_PX = 6

/** The keys a range takes for itself. Here they go a chapter at a time, which a scrub of a thousandth cannot. */
const STEP_KEYS: Record<string, 1 | -1> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  PageDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  PageUp: 1,
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Copied from Solar's, with the tape always full: it is the whole life rather
 * than the last two minutes watched. Every chapter has a mark in its own
 * colour, an equal step apart, the latest at the end, and pointing at a mark
 * says which chapter it is. A drag snaps to a mark it
 * comes within 6px of and settles on the nearest when it is let go; the
 * arrow keys go a chapter at a time.
 */
export function Timeline(props: TimelineProps): ReactElement {
  const { expanded, marks, moment, attachTape, onScrub, onScrubEnd, onStep, onFirst, onLast } = props
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    attachTape(rootRef.current, inputRef.current)
    return () => attachTape(null, null)
  }, [attachTape])

  // A drag can end outside the input, where no handler on it hears, so the
  // end is listened for on the window, as Solar's tape does.
  const scrubbing = useRef(false)
  const finish = (): void => {
    if (!scrubbing.current) return
    scrubbing.current = false
    onScrubEnd()
  }
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

  // Where the pointer is over the tape, in pixels from its left and out of its width.
  const [hand, setHand] = useState<[number, number] | null>(null)
  let pointed: Mark | null = null
  if (hand) {
    let near = SNAP_PX
    for (const m of marks) {
      const d = Math.abs(m.at * hand[1] - hand[0])
      if (d < near) {
        near = d
        pointed = m
      }
    }
  }

  const style = {
    '--lb-tl-rec-left': '0%',
    '--lb-tl-rec-width': '100%',
  } as CSSProperties

  return (
    <div ref={rootRef} className={`lb-timeline${expanded ? ' is-expanded' : ''}`} style={style}>
      <input
        ref={inputRef}
        className="lb-timeline-input"
        type="range"
        min={0}
        max={1}
        step={0.0001}
        defaultValue={1}
        aria-label="Move through the years"
        aria-valuetext={moment}
        onChange={(e) => {
          scrubbing.current = true
          const input = e.currentTarget
          let p = clamp01(input.valueAsNumber)
          let near = SNAP_PX / Math.max(1, input.getBoundingClientRect().width)
          for (const { at } of marks) {
            const d = Math.abs(at - p)
            if (d < near) {
              near = d
              p = at
            }
          }
          onScrub(p)
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setHand([e.clientX - r.left, r.width])
        }}
        onPointerLeave={() => setHand(null)}
        onKeyDown={(e) => {
          const way = STEP_KEYS[e.key]
          if (way) onStep(way)
          else if (e.key === 'Home') onFirst()
          else if (e.key === 'End') onLast()
          else return
          e.preventDefault()
        }}
        onBlur={finish}
      />
      <div className="lb-timeline-visual" aria-hidden="true">
        <span className="lb-timeline-track" />
        <span className="lb-timeline-recorded" />
        {marks.map((m) => (
          <span
            key={m.name}
            className={`sl-mark${m === pointed ? ' is-pointed' : ''}`}
            style={{ left: `${m.at * 100}%`, '--lb-swatch': m.hex } as CSSProperties}
          />
        ))}
        <span className="lb-timeline-head" />
        {pointed && (
          <span className="sl-mark-tip" style={{ left: `${pointed.at * 100}%` }}>
            <span className="lb-tray-swatch" style={{ '--lb-swatch': pointed.hex } as CSSProperties} />
            <span className="sl-mark-tip-kind">{pointed.name}</span>
            <span className="sl-mark-tip-when">{pointed.from}</span>
          </span>
        )}
      </div>
    </div>
  )
}
