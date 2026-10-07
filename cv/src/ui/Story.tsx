import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactElement, Ref, SyntheticEvent } from 'react'
import type { Snapshot } from '../app/instrument'
import { LIFE, WEB, facts, yearsOf } from '../life'
import type { Chapter } from '../life'
import { LOGOS } from '../logos'
import type { Logo as LogoData, LogoId } from '../logos'
import { closingParts } from '../text'
import { Mark } from './Reach'

/** The old face fading out, as `--lb-t-grow`. */
const LEAVE_MS = 180

/** The new one rising in, its last line done: 220ms of delay and 230ms of rise, as ui.css staggers it. */
const ENTER_MS = 450

export interface StoryActions {
  copyEmail: () => void
  /** The pointer is on the story, so Play waits. */
  hold: (on: boolean) => void
}

/** A chapter's years and place in the kicker, as a reader says them: `2012 to 2015, Joensuu`. */
function kickerOf(chapter: Chapter): string {
  return [yearsOf(chapter), chapter.where].filter(Boolean).join(', ')
}

/**
 * Keeps a logo's name, centred under it, inside the story's column: the
 * first logo in a row is often a narrow mark with a long name, which would
 * run out past the column's edge, and on a phone off the screen.
 */
function keepNameIn(e: SyntheticEvent<HTMLElement>): void {
  const logo = e.currentTarget
  const name = logo.querySelector<HTMLElement>('.cv-logo-name')
  const column = logo.closest('.cv-face')?.getBoundingClientRect()
  if (!name || !column) return
  const at = logo.getBoundingClientRect()
  const half = name.offsetWidth / 2
  const middle = at.left + at.width / 2
  const nudge = Math.max(0, column.left - (middle - half)) || Math.min(0, column.right - (middle + half))
  logo.style.setProperty('--cv-nudge', `${nudge}px`)
}

/**
 * One logo, at its row's height times its own scale and as wide as its
 * viewBox makes that. Named for a screen reader and, under the pointer or
 * focus, in its own colour and in words under it. Not a link.
 *
 * A `type` logo is its name, set in type. A place's mark alone in its
 * chapter, `named`, has its name beside it all the time, as a lockup: one
 * emblem on its own says too little to be known by.
 */
function Logo({ id, named = false }: { id: LogoId; named?: boolean }): ReactElement {
  const logo: LogoData = LOGOS[id]
  const style = {
    '--cv-scale': logo.scale,
    '--cv-brand': logo.hex ?? 'var(--lb-ink-strong, #101014)',
  } as CSSProperties
  if (logo.kind === 'type') {
    return (
      <span className="cv-logo is-type" style={style}>
        {logo.name}
      </span>
    )
  }
  const [, , w, h] = logo.viewBox.split(' ').map(Number)
  const mark = (
    <svg
      viewBox={logo.viewBox}
      aria-hidden="true"
      style={{ aspectRatio: `${w} / ${h}` }}
      dangerouslySetInnerHTML={{ __html: logo.body }}
    />
  )
  if (named) {
    return (
      <span className="cv-logo is-named" role="img" aria-label={logo.name} style={style}>
        {mark}
        <span className="cv-logo-type" aria-hidden="true">
          {logo.name}
        </span>
      </span>
    )
  }
  return (
    <span
      className="cv-logo"
      role="img"
      aria-label={logo.name}
      tabIndex={0}
      style={style}
      onPointerEnter={keepNameIn}
      onFocus={keepNameIn}
    >
      {mark}
      <span className="cv-logo-name" aria-hidden="true">
        {logo.name}
      </span>
    </span>
  )
}

/** Where it happened, then what with, smaller: one row that wraps. The games are stickers. */
function Logos({ chapter }: { chapter: Chapter }): ReactElement | null {
  const { orgs, tools, stickers } = chapter
  if (orgs.length === 0 && tools.length === 0) return null
  const [only] = orgs
  const named = orgs.length === 1 && tools.length === 0 && only !== undefined && LOGOS[only].kind === 'mark'
  return (
    <div className={`cv-logos${stickers ? ' is-stickers' : ''}`}>
      {orgs.length > 0 && (
        <span className="cv-orgs">
          {orgs.map((id) => (
            <Logo key={id} id={id} named={named} />
          ))}
        </span>
      )}
      {tools.length > 0 && (
        <span className="cv-tools">
          {tools.map((id) => (
            <Logo key={id} id={id} />
          ))}
        </span>
      )}
    </div>
  )
}

/** A chapter: when and where, the line it is, what happened, and the logos. */
function ChapterFace({ chapter }: { chapter: Chapter }): ReactElement {
  return (
    <>
      <p className="cv-kicker">{kickerOf(chapter)}</p>
      <h2 className="cv-headline">{chapter.headline}</h2>
      <p className="cv-copy">{chapter.copy}</p>
      <Logos chapter={chapter} />
    </>
  )
}

/** At Now: who, the facts, how to reach him, what else, and the instruments. */
function NowFace({ copyEmail }: Pick<StoryActions, 'copyEmail'>): ReactElement {
  const { reach } = LIFE
  return (
    <>
      <h1 className="cv-headline">{LIFE.name}</h1>
      <p className="cv-copy">{LIFE.intro}</p>
      <dl className="cv-facts">
        {facts()
          .filter((f) => f.label !== 'Reach')
          .map((f) => (
            <div key={f.label}>
              <dt className="cv-label">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
      </dl>
      <p className="cv-contact">
        <span className="cv-label">Reach</span>
        <span className="cv-contact-ways">
          <button type="button" className="cv-link" onClick={copyEmail}>
            <Mark way="email" />
            {reach.email}
          </button>
          {WEB.map((id) => (
            <a key={id} className="cv-link" href={reach[id]} target="_blank" rel="noreferrer">
              <Mark way={id} />
              {LOGOS[id].name}
            </a>
          ))}
        </span>
      </p>
      <p className="cv-aside">Off screen: {LIFE.outside}</p>
      <p className="cv-aside cv-signoff">
        {closingParts(LIFE.closing).map((p, i) =>
          p.href ? (
            <a key={i} className="cv-link" href={p.href}>
              {p.text}
            </a>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
    </>
  )
}

function Face({ chapter, actions }: { chapter: number | null; actions: StoryActions }): ReactElement {
  const c = chapter === null ? undefined : LIFE.chapters[chapter]
  return c ? <ChapterFace chapter={c} /> : <NowFace copyEmail={actions.copyEmail} />
}

const keyOf = (chapter: number | null): string => (chapter === null ? 'now' : `chapter-${chapter}`)

/** The probe takes no presses. */
const NONE: StoryActions = { copyEmail: () => undefined, hold: () => undefined }

/**
 * Every face, unseen, in the same cell, for App.tsx to lay the sheets under
 * the tallest. They never change, so the story's every move leaves them be.
 */
const Probe = memo(function Probe({ probeRef }: { probeRef: Ref<HTMLDivElement> }): ReactElement {
  return (
    <div ref={probeRef} className="cv-faces cv-probe" aria-hidden="true" inert>
      {[null, ...LIFE.chapters.map((_, i) => i)].map((i) => (
        <div key={keyOf(i)} className="cv-face">
          <Face chapter={i} actions={NONE} />
        </div>
      ))}
    </div>
  )
})

/** A face as it is up: which, and the how-manyth, so a chapter come back to is a new face. */
interface Up {
  chapter: number | null
  n: number
}

/** A face on its way out, and whether it was still rising when it went. */
interface Out extends Up {
  rising: boolean
}

interface Faces {
  shown: Up
  rising: boolean
  leaving: Out[]
}

/**
 * The story, open type on the lit surface over the sheets: the chapter being
 * read, or at Now who he is. It stays when the rest of the chrome rests, and
 * a press on it is never only a wake, so a recruiter's first tap on the email
 * copies it.
 *
 * A new face rises in line by line as the old one fades up and away, laid
 * over it so the story keeps its place. Every move sends the face that is up
 * out as it is, still rising or not, so a quick scrub fades through the faces
 * it passes and never blinks to nothing; each is gone in LEAVE_MS. Focus in
 * a face that goes out stays in the story.
 */
export function Story({
  snap,
  actions,
  storyRef,
  probeRef,
}: {
  snap: Snapshot
  actions: StoryActions
  storyRef: (el: HTMLElement | null) => void
  probeRef: Ref<HTMLDivElement>
}): ReactElement {
  const at = snap.chapter
  const [faces, setFaces] = useState<Faces>(() => ({ shown: { chapter: at, n: 0 }, rising: false, leaving: [] }))
  // Taken in while rendering, so the old face never draws a frame on its own
  // after the instrument has moved on.
  if (faces.shown.chapter !== at) {
    setFaces({
      shown: { chapter: at, n: faces.shown.n + 1 },
      rising: true,
      leaving: [...faces.leaving, { ...faces.shown, rising: faces.rising }],
    })
  }
  const { shown, rising, leaving } = faces

  const section = useRef<HTMLElement | null>(null)
  const setSection = useCallback(
    (el: HTMLElement | null) => {
      section.current = el
      storyRef(el)
    },
    [storyRef],
  )

  // Before the browser lets go of focus in a face gone inert: to the story
  // itself, so Tab goes on from there into the new face.
  useLayoutEffect(() => {
    const story = section.current
    const focused = document.activeElement
    if (story && focused?.closest('.cv-face.is-leaving') && story.contains(focused)) {
      story.focus({ preventScroll: true })
    }
  }, [shown.n])

  useEffect(() => {
    if (!rising) return
    const n = shown.n
    const t = window.setTimeout(() => setFaces((f) => (f.shown.n === n ? { ...f, rising: false } : f)), ENTER_MS)
    return () => window.clearTimeout(t)
  }, [rising, shown.n])

  // Each face out goes in its own time, however many follow it.
  const timers = useRef(new Map<number, number>())
  useEffect(() => {
    const map = timers.current
    for (const { n } of leaving) {
      if (map.has(n)) continue
      const drop = (): void => {
        map.delete(n)
        setFaces((f) => ({ ...f, leaving: f.leaving.filter((o) => o.n !== n) }))
      }
      map.set(n, window.setTimeout(drop, LEAVE_MS))
    }
  }, [leaving])
  useEffect(() => {
    const map = timers.current
    return () => {
      for (const t of map.values()) window.clearTimeout(t)
      map.clear()
    }
  }, [])

  return (
    <section
      ref={setSection}
      className={`cv-story${snap.paper ? ' is-reading' : ''}`}
      aria-label="About Mohsen"
      tabIndex={-1}
      onPointerEnter={() => actions.hold(true)}
      onPointerLeave={() => actions.hold(false)}
    >
      {/* One keyed list, out first and in after, so the face that goes out
          is the one that was up, as it was, and stays where it is in the page. */}
      <div className="cv-faces">
        {[...leaving.map((o) => ({ ...o, out: true })), { ...shown, rising, out: false }].map((f) => (
          <div
            key={f.n}
            className={`cv-face${f.out ? ' is-leaving' : ''}${f.rising ? ' is-entering' : ''}`}
            aria-hidden={f.out || undefined}
            inert={f.out}
          >
            <Face chapter={f.chapter} actions={actions} />
          </div>
        ))}
      </div>
      <Probe probeRef={probeRef} />
    </section>
  )
}
