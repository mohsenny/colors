import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Snapshot } from '../app/instrument'
import type { BodyId } from '../sky/bodies'
import type { Eclipse } from '../sky/eclipses'
import { Bodies } from './Bodies'
import { PauseIcon, PlayIcon, PlusIcon } from './Icons'
import { Options } from './Options'
import { Speed } from './Speed'
import { Sphere } from './Sphere'
import { Timeline } from './Timeline'
import type { TimelineProps } from './Timeline'

export interface DockProps {
  snap: Snapshot
  /** Hands the instrument the two spans it writes the date and time into every frame. */
  attachClock(day: HTMLElement | null, time: HTMLElement | null): void
  timeline: TimelineProps
  onTogglePlay(): void
  onRung(rung: number): void
  onBecome(id: BodyId): void
  onWatch(e: Eclipse): void
  onNow(): void
}

/** Quiet time before the chrome recedes, as in Lightbox. */
const IDLE_MS = 2400

type Drawer = 'bodies' | 'speed' | 'options' | null

export function Dock(props: DockProps): ReactElement {
  const { snap, attachClock, timeline, onTogglePlay, onRung, onBecome, onWatch, onNow } = props
  const { playing } = snap
  const [idle, setIdle] = useState(false)
  const [drawer, setDrawer] = useState<Drawer>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLButtonElement | null>(null)
  const speedRef = useRef<HTMLButtonElement | null>(null)
  const moreRef = useRef<HTMLButtonElement | null>(null)
  const dayRef = useRef<HTMLSpanElement | null>(null)
  const timeRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    attachClock(dayRef.current, timeRef.current)
    return () => attachClock(null, null)
  }, [attachClock])

  useEffect(() => {
    let timer = 0
    const arm = (): void => {
      window.clearTimeout(timer)
      if (!playing || drawer) return
      timer = window.setTimeout(() => {
        const root = rootRef.current
        if (root && root.contains(document.activeElement)) return
        setIdle(true)
      }, IDLE_MS)
    }
    const wake = (): void => {
      setIdle(false)
      arm()
    }
    arm()
    const passive = { passive: true } as const
    const events = ['pointermove', 'pointerdown', 'wheel', 'touchstart', 'keydown', 'focusin', 'focusout'] as const
    for (const ev of events) window.addEventListener(ev, wake, passive)
    return () => {
      window.clearTimeout(timer)
      for (const ev of events) window.removeEventListener(ev, wake)
    }
  }, [playing, drawer])

  // A drawer is a transient layer: touching anything else, or Escape, puts it away.
  useEffect(() => {
    if (!drawer) return
    const away = (e: PointerEvent): void => {
      const root = rootRef.current
      if (root && e.target instanceof Node && root.contains(e.target)) return
      setDrawer(null)
    }
    const escape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      ;({ bodies: bodyRef, speed: speedRef, options: moreRef })[drawer].current?.focus()
      setDrawer(null)
    }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', escape, true)
    }
  }, [drawer])

  const toggle = (d: Exclude<Drawer, null>): void => setDrawer((v) => (v === d ? null : d))

  return (
    <div
      ref={rootRef}
      className={`lb-dock${idle && playing ? ' is-idle' : ''}${timeline.expanded ? ' is-expanded' : ''}`}
    >
      {/* First, as New is in Lightbox: where you are is what the instrument is about. */}
      <button
        ref={bodyRef}
        type="button"
        className={`lt-chip${drawer === 'bodies' ? ' is-on' : ''}`}
        aria-label={`On ${snap.seat.name}. Go to another body`}
        aria-expanded={drawer === 'bodies'}
        onClick={() => toggle('bodies')}
      >
        <Sphere color={snap.seat.color} star={snap.seat.kind === 'star'} />
        <span className="lt-chip-label" aria-hidden="true">
          {snap.seat.name}
        </span>
      </button>

      <button type="button" className="lb-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={onTogglePlay}>
        {playing ? <PauseIcon /> : <PlayIcon back={snap.reverse} />}
      </button>

      {/* Written by the instrument every frame, not by React. */}
      <div className="sl-clock" role="timer" aria-label="Date and time, UTC">
        <span ref={dayRef} className="sl-clock-day" />
        <span ref={timeRef} className="sl-clock-time" />
        <span className="sl-clock-zone">UTC</span>
      </div>

      <Timeline {...timeline} />

      <button
        ref={speedRef}
        type="button"
        className={`sl-rate${drawer === 'speed' ? ' is-on' : ''}`}
        aria-label={`Speed: ${snap.rate}${snap.reverse ? ', backward' : ''}. Change it`}
        aria-expanded={drawer === 'speed'}
        onClick={() => toggle('speed')}
      >
        <span className={`sl-rate-name${snap.reverse ? ' is-back' : ''}`} aria-hidden="true">
          {snap.rate}
        </span>
      </button>

      <button
        ref={moreRef}
        type="button"
        className={`lb-btn lb-btn-more${drawer === 'options' ? ' is-on' : ''}`}
        aria-label="Eclipses and more"
        aria-expanded={drawer === 'options'}
        onClick={() => toggle('options')}
      >
        <PlusIcon open={drawer === 'options'} />
      </button>

      <Bodies
        open={drawer === 'bodies'}
        seat={snap.seat.id}
        onSelect={(id) => {
          onBecome(id)
          setDrawer(null)
        }}
      />
      <Speed
        open={drawer === 'speed'}
        rung={snap.rung}
        onTurn={onRung}
        onSelect={(rung) => {
          onRung(rung)
          setDrawer(null)
        }}
      />
      <Options
        open={drawer === 'options'}
        solar={snap.solar}
        lunar={snap.lunar}
        live={snap.live}
        onWatch={(e) => {
          onWatch(e)
          setDrawer(null)
        }}
        onNow={() => {
          onNow()
          setDrawer(null)
        }}
      />
    </div>
  )
}
