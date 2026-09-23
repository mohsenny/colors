import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { BlendMode } from '../core/types'
import { Options } from './Options'
import { Timeline } from './Timeline'
import type { TimelineProps } from './Timeline'

export interface DockProps {
  playing: boolean
  blend: BlendMode
  /** Passed straight through to Timeline. */
  timeline: TimelineProps
  /** Passed straight through to Options. */
  slideCount: number
  warmth: number
  onTogglePlay(): void
  onRegenerate(): void
  onBlendChange(mode: BlendMode): void
  onSlideCountChange(count: number): void
  onWarmthChange(warmth: number): void
}

/** Quiet time before the chrome recedes. Long enough to not flicker mid-reach. */
const IDLE_MS = 2400

function Icon({ children }: { children: ReactElement | ReactElement[] }): ReactElement {
  return (
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
      {children}
    </svg>
  )
}

function PlayIcon(): ReactElement {
  return (
    <Icon>
      <path d="M4.4 2.6 11 7l-6.6 4.4Z" />
    </Icon>
  )
}

function PauseIcon(): ReactElement {
  return (
    <Icon>
      <path d="M5.1 2.9v8.2" />
      <path d="M8.9 2.9v8.2" />
    </Icon>
  )
}

function RegenerateIcon(): ReactElement {
  return (
    <Icon>
      <path d="M11.9 7a4.9 4.9 0 1 1-1.55-3.58" />
      <path d="M9.5 3.3h2.7V.9" />
    </Icon>
  )
}

/**
 * The plus, and the cross it becomes. One path that rotates rather than two
 * that swap, so opening the drawer is a single continuous gesture.
 */
function PlusIcon({ open }: { open: boolean }): ReactElement {
  return (
    <svg
      className={`lb-icon lb-plus${open ? ' is-open' : ''}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 3.2v7.6M3.2 7h7.6" />
    </svg>
  )
}

export function Dock(props: DockProps): ReactElement {
  const {
    playing,
    blend,
    timeline,
    slideCount,
    warmth,
    onTogglePlay,
    onRegenerate,
    onBlendChange,
    onSlideCountChange,
    onWarmthChange,
  } = props
  const [idle, setIdle] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const moreRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let timer = 0

    const arm = (): void => {
      window.clearTimeout(timer)
      // Paused is a studying state: the controls stay fully present. Listeners
      // stay attached while paused so the activity that resumes playback is
      // itself what clears a stale idle flag. An open drawer is the same kind
      // of state: you opened it to change something, so it waits.
      if (!playing || optionsOpen) return
      timer = window.setTimeout(() => {
        const root = rootRef.current
        // Keyboard users park focus on a control; fading it out would be a trap.
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
    window.addEventListener('pointermove', wake, passive)
    window.addEventListener('pointerdown', wake, passive)
    window.addEventListener('wheel', wake, passive)
    window.addEventListener('touchstart', wake, passive)
    window.addEventListener('keydown', wake)
    window.addEventListener('focusin', wake)
    window.addEventListener('focusout', wake)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('wheel', wake)
      window.removeEventListener('touchstart', wake)
      window.removeEventListener('keydown', wake)
      window.removeEventListener('focusin', wake)
      window.removeEventListener('focusout', wake)
    }
  }, [playing, optionsOpen])

  /*
   * The drawer is a transient layer, so touching anything else puts it away.
   * Reaching past it to grab a sheet or sample a crossing means you are done
   * with it, and having to come back and press the cross is a second gesture
   * for something you already said.
   *
   * `pointerdown`, not `click`: the sheets start a drag on pointerdown, so a
   * drag that begins outside the drawer never produces a click and the drawer
   * would survive the whole gesture. Nothing is prevented or stopped here, so
   * the press still reaches the stage and the drag starts on the same frame.
   */
  useEffect(() => {
    if (!optionsOpen) return

    const away = (e: PointerEvent): void => {
      const root = rootRef.current
      if (root && e.target instanceof Node && root.contains(e.target)) return
      setOptionsOpen(false)
    }

    const escape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      /*
       * Escape peels one layer, and while the drawer is up the drawer is the
       * top layer. App also answers Escape, by clearing the selection, and a
       * single press doing both would restart a sheet the user had deliberately
       * stopped. Capture phase on window fires before any bubble listener on
       * window whatever order they were attached in, so stopping here is
       * deterministic rather than a race with effect ordering.
       */
      e.stopPropagation()
      setOptionsOpen(false)
      // Only the keyboard path has to move focus. An outside press has already
      // moved it to whatever was pressed, but Escape would leave it parked on a
      // control inside a drawer that is now hidden from the accessibility tree.
      moreRef.current?.focus()
    }

    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', escape, true)
    }
  }, [optionsOpen])

  return (
    <div
      ref={rootRef}
      className={`lb-dock${idle && playing ? ' is-idle' : ''}${
        // The dock has to know, not just the timeline: it shifts by half the
        // growth so the widening happens to the right of the play button.
        timeline.expanded ? ' is-expanded' : ''
      }`}
    >
      <button
        type="button"
        className="lb-btn"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={onTogglePlay}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <Timeline {...timeline} />

      <button type="button" className="lb-btn" aria-label="New colours" onClick={onRegenerate}>
        <RegenerateIcon />
      </button>

      <div className="lb-seg" role="group" aria-label="Colour mode" data-mode={blend}>
        <span className="lb-seg-indicator" aria-hidden="true" />
        {/*
          Five letters each, which is not a coincidence: the sliding indicator
          is a 50% pill, so two labels of different lengths would leave it
          sitting off the word it is meant to be under.
        */}
        <button
          type="button"
          className="lb-seg-btn"
          aria-pressed={blend === 'paint'}
          onClick={() => onBlendChange('paint')}
        >
          Paint
        </button>
        <button
          type="button"
          className="lb-seg-btn"
          aria-pressed={blend === 'light'}
          onClick={() => onBlendChange('light')}
        >
          Light
        </button>
      </div>

      <button
        ref={moreRef}
        type="button"
        className={`lb-btn lb-btn-more${optionsOpen ? ' is-on' : ''}`}
        aria-label="More options"
        aria-expanded={optionsOpen}
        onClick={() => setOptionsOpen((v) => !v)}
      >
        <PlusIcon open={optionsOpen} />
      </button>

      <Options
        open={optionsOpen}
        slideCount={slideCount}
        warmth={warmth}
        onSlideCountChange={onSlideCountChange}
        onWarmthChange={onWarmthChange}
      />
    </div>
  )
}
