import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { Snapshot } from '../app/instrument'
import { LIFE } from '../life'
import { Chapters } from './Chapters'
import { chapterHex } from './hex'
import { PauseIcon, PlayIcon } from './Icons'
import { Timeline } from './Timeline'
import type { TimelineProps } from './Timeline'

export interface DockProps {
  snap: Snapshot
  /** Hands the instrument the span it writes the year into every frame. */
  attachClock(el: HTMLElement | null): void
  timeline: TimelineProps
  onTogglePlay(): void
  onToggleList(): void
  onCloseList(): void
  onGo(index: number): void
  onNow(): void
  onPaper(): void
}

/**
 * Every chapter's colour side by side, oldest on the left as on the tape: the
 * chip's swatch at Now, when it stands for all of them.
 */
const ALL = `linear-gradient(90deg, ${LIFE.chapters
  .map((_, i, all) => `${chapterHex(i)} ${(i / all.length) * 100}% ${((i + 1) / all.length) * 100}%`)
  .join(', ')})`

/** What the chip says and shows: the chapter being read, or all of them at Now. */
function chipOf(snap: Snapshot): { name: string; swatch: string } {
  const c = snap.chapter === null ? undefined : LIFE.chapters[snap.chapter]
  if (c && snap.chapter !== null) return { name: c.name, swatch: chapterHex(snap.chapter) }
  return { name: 'Chapters', swatch: ALL }
}

/**
 * Solar's dock, trimmed to what a life needs: which chapter, the year, Now,
 * Play and the tape, and the CV as text. No knob, no Save and no plus.
 */
export function Dock(props: DockProps): ReactElement {
  const { snap, attachClock, timeline, onTogglePlay, onToggleList, onCloseList, onGo, onNow, onPaper } = props
  const { playing, list } = snap
  const rootRef = useRef<HTMLDivElement | null>(null)
  const chipRef = useRef<HTMLButtonElement | null>(null)
  const clockRef = useRef<HTMLSpanElement | null>(null)
  const live = snap.chapter === null
  const chip = chipOf(snap)

  useEffect(() => {
    attachClock(clockRef.current)
    return () => attachClock(null)
  }, [attachClock])

  // A drawer is a transient layer: touching anything else puts it away.
  // Escape is the instrument's, which knows the paper goes first.
  useEffect(() => {
    if (!list) return
    const away = (e: PointerEvent): void => {
      const root = rootRef.current
      if (root && e.target instanceof Node && root.contains(e.target)) return
      onCloseList()
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [list, onCloseList])

  // Closed with focus inside it, the drawer hands focus back to its chip
  // rather than to a row that has just been hidden.
  const wasOpen = useRef(list)
  useEffect(() => {
    if (wasOpen.current && !list && rootRef.current?.querySelector('.lt-bodies')?.contains(document.activeElement)) {
      chipRef.current?.focus()
    }
    wasOpen.current = list
  }, [list])

  return (
    <div ref={rootRef} className={`lb-dock${timeline.expanded ? ' is-expanded' : ''}`}>
      {/* First, as in Solar: where in the life you are. */}
      <button
        ref={chipRef}
        type="button"
        className={`lt-chip${list ? ' is-on' : ''}`}
        aria-label={live ? 'Chapters' : `${chip.name}. Go to another chapter`}
        aria-expanded={list}
        onClick={onToggleList}
      >
        <span className="lb-tray-swatch" style={{ '--lb-swatch': chip.swatch } as CSSProperties} />
        <span className="lt-chip-label" aria-hidden="true">
          {chip.name}
        </span>
      </button>

      {/* Then when: written by the instrument every frame, not by React. The
          live region says where it settles, so this is not read out. */}
      <div className="sl-clock" aria-hidden="true">
        <span ref={clockRef} className="cv-clock-year" />
      </div>

      {/* As on a live stream: lit at Now, and the way back to it once the clock has left. */}
      <button
        type="button"
        className="sl-now"
        aria-label="Back to now"
        aria-disabled={live || undefined}
        onClick={live ? undefined : onNow}
      >
        <span className="sl-now-dot" />
        <span className="sl-now-label" aria-hidden="true">
          Now
        </span>
      </button>

      <button type="button" className="lb-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={onTogglePlay}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <Timeline {...timeline} />

      {/* A word at every width: it is the one a recruiter is looking for. */}
      <button type="button" className="cv-paper-btn" aria-pressed={snap.paper} aria-label="CV as text" onClick={onPaper}>
        CV
      </button>

      <Chapters
        open={list}
        chapter={snap.chapter}
        onSelect={(i) => {
          onGo(i)
          onCloseList()
        }}
      />
    </div>
  )
}
