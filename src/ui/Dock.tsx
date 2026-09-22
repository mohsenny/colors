import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { BlendMode } from '../core/types'
import { Timeline } from './Timeline'
import type { TimelineProps } from './Timeline'

export interface DockProps {
  playing: boolean
  blend: BlendMode
  /** Passed straight through to Timeline. */
  timeline: TimelineProps
  onTogglePlay(): void
  onRegenerate(): void
  onBlendChange(mode: BlendMode): void
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

export function Dock(props: DockProps): ReactElement {
  const { playing, blend, timeline, onTogglePlay, onRegenerate, onBlendChange } = props
  const [idle, setIdle] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let timer = 0

    const arm = (): void => {
      window.clearTimeout(timer)
      // Paused is a studying state: the controls stay fully present. Listeners
      // stay attached while paused so the activity that resumes playback is
      // itself what clears a stale idle flag.
      if (!playing) return
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
  }, [playing])

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
        <button
          type="button"
          className="lb-seg-btn"
          aria-pressed={blend === 'light'}
          onClick={() => onBlendChange('light')}
        >
          Light
        </button>
        <button
          type="button"
          className="lb-seg-btn"
          aria-pressed={blend === 'blend'}
          onClick={() => onBlendChange('blend')}
        >
          Blend
        </button>
      </div>
    </div>
  )
}
