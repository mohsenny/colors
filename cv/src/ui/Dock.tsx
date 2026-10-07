import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import type { Snapshot } from '../app/instrument'
import { PAPER_ID } from '../text'
import { CloseIcon, PageIcon, PauseIcon, PlayIcon } from './Icons'
import { Timeline } from './Timeline'
import type { TimelineProps } from './Timeline'

export interface DockProps {
  snap: Snapshot
  /** Hands the instrument the span it writes the year into every frame. */
  attachClock(el: HTMLElement | null): void
  timeline: TimelineProps
  onTogglePlay(): void
  onPaper(): void
}

/**
 * Solar's dock, trimmed to what a life needs: the year, Play and the tape,
 * and the CV as text. The chapters are the sheets on the stage, so the dock
 * lists none of its own.
 */
export function Dock(props: DockProps): ReactElement {
  const { snap, attachClock, timeline, onTogglePlay, onPaper } = props
  const clockRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    attachClock(clockRef.current)
    return () => attachClock(null)
  }, [attachClock])

  return (
    <div className={`lb-dock${timeline.expanded ? ' is-expanded' : ''}`}>
      {/* Written by the instrument every frame, not by React. The live region
          says where it settles, so this is not read out. */}
      <div className="sl-clock" aria-hidden="true">
        <span ref={clockRef} className="cv-clock-year" />
      </div>

      <button type="button" className="lb-btn" aria-label={snap.playing ? 'Pause' : 'Play'} onClick={onTogglePlay}>
        {snap.playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <Timeline {...timeline} />

      {/* A page and the word at every width: it is what a recruiter is looking
          for. Open, it turns light and the page becomes a cross after the word,
          the same width, so the dock holds still. */}
      <button
        type="button"
        className={`cv-paper-btn${snap.paper ? ' is-open' : ''}`}
        aria-expanded={snap.paper}
        aria-controls={PAPER_ID}
        aria-label="CV as text"
        onClick={onPaper}
      >
        {!snap.paper && <PageIcon />}
        <span aria-hidden="true">CV</span>
        {snap.paper && <CloseIcon />}
      </button>
    </div>
  )
}
