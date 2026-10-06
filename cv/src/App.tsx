import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Instrument } from './app/instrument'
import type { Snapshot } from './app/instrument'
import { LIFE, yearsOf } from './life'
import { PAPER_ID } from './text'
import { Dock } from './ui/Dock'
import { chapterHex } from './ui/hex'
import { Legend } from './ui/Legend'
import { Paper } from './ui/Paper'
import { Story } from './ui/Story'
import type { StoryActions } from './ui/Story'
import type { Mark } from './ui/Timeline'
import { useIdle } from '../../src/ui/idle'
import { Title } from '../../src/ui/Title'
import { Toast } from '../../src/ui/Toast'
import type { Note } from '../../src/ui/Toast'

const REDUCED = '(prefers-reduced-motion: reduce)'

/** Keys that are only half of one, and stop nothing on their own. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/** What the tape's input says where the clock is: the chapter and its years, or Now. */
function momentOf(snap: Snapshot): string {
  const c = snap.chapter === null ? undefined : LIFE.chapters[snap.chapter]
  return c ? `${c.name}, ${yearsOf(c)}` : 'Now'
}

function Chrome({ instrument, storySlot }: { instrument: Instrument; storySlot: HTMLElement | null }): ReactElement {
  const snap: Snapshot = useSyncExternalStore(instrument.subscribe, instrument.getSnapshot)
  const [note, setNote] = useState<Note | null>(null)
  const probe = useRef<HTMLDivElement | null>(null)
  const attachClock = useCallback((el: HTMLElement | null) => instrument.attachClock(el), [instrument])
  const attachTape = useCallback(
    (el: HTMLElement | null, input: HTMLInputElement | null) => instrument.attachTape(el, input),
    [instrument],
  )
  const closeList = useCallback(() => instrument.closeList(), [instrument])
  const [marks] = useState<Mark[]>(() =>
    instrument.stopsOnTape().map((at, i) => {
      const c = LIFE.chapters[i]
      return { at, name: c?.name ?? '', from: String(c?.from ?? ''), hex: chapterHex(i) }
    }),
  )

  // An open paper or list holds the chrome up, as an open drawer does.
  useIdle(snap.paper || snap.list)

  // The life is laid under the story at its tallest, whichever face is up,
  // so the sheets keep their place as faces come and go, and a page opened
  // on a chapter lays them where Now will. Every face lies unseen in the
  // probe, so a font arriving or the width changing measures again.
  const measure = useCallback(() => {
    const rect = probe.current?.getBoundingClientRect()
    if (rect && rect.height > 0) instrument.setStory(rect.bottom)
  }, [instrument])
  useLayoutEffect(measure, [measure, storySlot])
  useEffect(() => {
    const observer = new ResizeObserver(measure)
    if (probe.current) observer.observe(probe.current)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, storySlot])
  const attachStory = useCallback((el: HTMLElement | null) => instrument.attachStory(el), [instrument])

  const actions: StoryActions = {
    copyEmail: () => {
      // Where the page may not write the clipboard, the address opens in the
      // mail app instead, so a press is never for nothing.
      const mail = (): void => {
        window.location.href = `mailto:${LIFE.reach.email}`
      }
      if (!navigator.clipboard) {
        mail()
        return
      }
      void navigator.clipboard
        .writeText(LIFE.reach.email)
        .then(() => setNote({ text: 'Email copied', at: Date.now() }), mail)
    },
    hold: (on) => instrument.holdPlay(on),
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Any key but Play's own stops it, Tab and the arrows included.
      if (e.key !== ' ' && !MODIFIERS.has(e.key)) instrument.stop()
      const t = e.target as HTMLElement | null
      // The tape is a range input and keeps its arrows, Home and End; any
      // other input is typed in.
      if (t?.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') return
      // Reading the paper, Space and the rest scroll and select as text does.
      // Escape and T still put it away.
      const reading = t?.closest(`#${PAPER_ID}`)
      if (reading && e.key !== 'Escape' && e.key !== 't' && e.key !== 'T') return
      if (e.key === ' ') {
        // A focused link or button takes the space as its own press.
        if (t?.closest('a, button, summary, [contenteditable]')) return
        e.preventDefault()
        instrument.togglePlay()
      } else if (e.key === ',' || e.key === '<') {
        instrument.stepBy(-1)
      } else if (e.key === '.' || e.key === '>') {
        instrument.stepBy(1)
      } else if (e.key === 'n' || e.key === 'N') {
        instrument.now()
      } else if (e.key === 't' || e.key === 'T') {
        instrument.togglePaper()
      } else if (e.key === 'Escape') {
        instrument.escape()
      } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= LIFE.chapters.length) {
        instrument.go(Number(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [instrument])

  return (
    <>
      {storySlot &&
        createPortal(<Story snap={snap} actions={actions} storyRef={attachStory} probeRef={probe} />, storySlot)}
      <Paper open={snap.paper} />
      <Legend away={snap.paper} />
      <Dock
        snap={snap}
        attachClock={attachClock}
        timeline={{
          expanded: !snap.playing,
          marks,
          moment: momentOf(snap),
          attachTape,
          onScrub: (p) => instrument.scrubTo(p),
          onScrubEnd: () => instrument.scrubEnd(),
          onStep: (way) => instrument.stepBy(way),
          onFirst: () => instrument.go(0),
          onNow: () => instrument.now(),
        }}
        onTogglePlay={() => instrument.togglePlay()}
        onToggleList={() => instrument.toggleList()}
        onCloseList={closeList}
        onGo={(i) => instrument.go(i)}
        onNow={() => instrument.now()}
        onPaper={() => instrument.togglePaper()}
      />
      <Toast note={note} onDone={() => setNote(null)} />
      <div className="lb-sr" aria-live="polite">
        {snap.announce}
      </div>
    </>
  )
}

/*
 * The lit surface with the life laid on it, the story over it and the paper
 * one press away. Until the instrument is up, and without script at all, the
 * paper is out, so the page is the CV as text.
 */
export default function App(): ReactElement {
  const filmRef = useRef<HTMLDivElement | null>(null)
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [storySlot, setStorySlot] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const film = filmRef.current
    if (!film) return
    const media = window.matchMedia(REDUCED)
    const inst = new Instrument()
    inst.attach(film, media.matches)
    const onMotion = (): void => inst.setReduced(media.matches)
    media.addEventListener('change', onMotion)
    setInstrument(inst)
    return () => {
      media.removeEventListener('change', onMotion)
      inst.detach()
      setInstrument(null)
    }
  }, [])

  return (
    <main className="lb-stage cv-stage">
      {/* The first thing Tab reaches, and out of sight until it does: the
          whole CV in reading order, for a keyboard or a screen reader. */}
      <a
        className="lb-sr-only cv-skip"
        href="#text"
        onClick={(e) => {
          if (!instrument) return
          e.preventDefault()
          instrument.openPaper()
          // After the paper is in, so it can take focus.
          requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${PAPER_ID} .cv-text`)?.focus())
        }}
      >
        Read the CV as text
      </a>
      {/* The rest in the order a reader takes it, which is the order Tab
          does: the title, the story, the sheets, then the paper, the legend
          and the dock. The story is the chrome's, set in here. */}
      <Title active="mohsen" />
      <div ref={setStorySlot} className="cv-story-slot" />
      <div ref={filmRef} className="cv-film" />
      {instrument ? <Chrome instrument={instrument} storySlot={storySlot} /> : <Paper open />}
    </main>
  )
}
