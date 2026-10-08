import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useIdle } from '../../../src/ui/idle'
import { PhotoButton } from '../../../src/ui/PhotoButton'
import type { Snapshot } from '../app/instrument'
import { dayLabel } from '../app/time'
import type { BodyId } from '../sky/bodies'
import type { Eclipse, EclipseType } from '../sky/eclipses'
import { Bodies } from './Bodies'
import { PauseIcon, PlayIcon, PlusIcon } from './Icons'
import { Knob } from './Knob'
import { Options } from './Options'
import { Sphere } from './Sphere'
import { Timeline } from './Timeline'
import type { TimelineProps } from './Timeline'
import { When } from './When'
import type { To } from './When'

export interface DockProps {
  snap: Snapshot
  /** Hands the instrument the clock, and the two spans it writes the date and time into every frame. */
  attachClock(clock: HTMLElement | null, day: HTMLElement | null, time: HTMLElement | null): void
  timeline: TimelineProps
  onTogglePlay(): void
  onDial(dial: number): void
  onBecome(id: BodyId): void
  onWatch(e: Eclipse): void
  onStep(type: EclipseType, way: 1 | -1): void
  onNow(): void
  /** To a date set in the drawer behind the clock. */
  onGo(to: To): boolean
  /** Whether a date is being picked, for a fast clock to wait. */
  onHold(on: boolean): void
  onPhoto(): void
}

type Drawer = 'bodies' | 'when' | 'options' | null

export function Dock(props: DockProps): ReactElement {
  const { snap, attachClock, timeline, onTogglePlay, onDial, onBecome, onWatch, onStep, onNow, onGo, onHold, onPhoto } = props
  const { playing } = snap
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [at, setAt] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLButtonElement | null>(null)
  const clockRef = useRef<HTMLButtonElement | null>(null)
  const moreRef = useRef<HTMLButtonElement | null>(null)
  const dayRef = useRef<HTMLSpanElement | null>(null)
  const timeRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    attachClock(clockRef.current, dayRef.current, timeRef.current)
    return () => attachClock(null, null, null)
  }, [attachClock])

  useIdle(drawer !== null)

  const picking = drawer === 'when'
  useEffect(() => {
    if (!picking) return
    onHold(true)
    return () => onHold(false)
  }, [picking, onHold])

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
      ;({ bodies: bodyRef, when: clockRef, options: moreRef })[drawer].current?.focus()
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
      className={`lb-dock${timeline.expanded ? ' is-expanded' : ''}`}
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

      {/* Then when: written by the instrument every frame, not by React, and the way to another date. */}
      <button
        ref={clockRef}
        type="button"
        className={`sl-clock${picking ? ' is-on' : ''}`}
        aria-label={`${dayLabel(snap.ms)}. Go to another date`}
        aria-expanded={picking}
        onClick={(e) => {
          const c = e.currentTarget
          setAt(c.offsetLeft + c.offsetWidth / 2)
          toggle('when')
        }}
      >
        <span ref={dayRef} className="sl-clock-day" />
        <span ref={timeRef} className="sl-clock-time" />
        <span className="sl-clock-zone">UTC</span>
      </button>
      {/* Next to its opener, so Tab goes from the clock into it. */}
      <When open={picking} ms={snap.ms} at={at} onGo={onGo} />

      {/* As on a live stream: lit while the clock plays the present, and the way back to it once it has left. */}
      <button
        type="button"
        className="sl-now"
        aria-label="Back to now"
        aria-disabled={snap.live || undefined}
        onClick={snap.live ? undefined : onNow}
      >
        <span className="sl-now-dot" />
        <span className="sl-now-label" aria-hidden="true">
          Now
        </span>
      </button>

      {/* Then how time moves: play by the tape, as in Lightbox and Gravity, and the speed. */}
      <button type="button" className="lb-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={onTogglePlay}>
        {playing ? <PauseIcon /> : <PlayIcon back={snap.dial < 0} />}
      </button>

      <Timeline {...timeline} />

      <Knob dial={snap.dial} onDial={onDial} />

      <PhotoButton
        onPress={() => {
          setDrawer(null)
          onPhoto()
        }}
      />

      <button
        ref={moreRef}
        type="button"
        className={`lb-btn lb-btn-more${drawer === 'options' ? ' is-on' : ''}`}
        aria-label="Eclipses"
        aria-expanded={drawer === 'options'}
        onClick={() => toggle('options')}
      >
        <PlusIcon open={drawer === 'options'} />
      </button>

      <Bodies
        open={drawer === 'bodies'}
        seat={snap.seat.id}
        gone={snap.gone}
        onSelect={(id) => {
          onBecome(id)
          setDrawer(null)
        }}
      />
      <Options open={drawer === 'options'} solar={snap.solar} lunar={snap.lunar} onWatch={onWatch} onStep={onStep} />
    </div>
  )
}
