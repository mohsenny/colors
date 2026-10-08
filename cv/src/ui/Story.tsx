import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode, Ref, SyntheticEvent } from 'react'
import { COVER } from '../app/instrument'
import type { Snapshot } from '../app/instrument'
import { LIFE, yearsOf } from '../life'
import type { Chapter } from '../life'
import { LOGOS } from '../logos'
import type { Logo as LogoData, LogoId } from '../logos'
import { copyParts, siteOf } from '../text'
import { PageIcon, PlayIcon } from './Icons'

/** The old face fading out, as `--lb-t-grow`. */
const LEAVE_MS = 180

/** The new one rising in, its last line done: 220ms of delay and 230ms of rise, as ui.css staggers it. */
const ENTER_MS = 450

export interface StoryActions {
  /** The pointer is on the story, so Play waits. */
  hold: (on: boolean) => void
  play: () => void
  paper: () => void
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
 * A logo's own element: a link to the org's site, in a new tab as its name in
 * the copy is, where it has one, and otherwise a picture.
 */
function Shell({ href, children, ...rest }: { href: string | undefined } & HTMLAttributes<HTMLElement>): ReactElement {
  return href ? (
    <a {...rest} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <span {...rest} role="img">
      {children}
    </span>
  )
}

/**
 * One logo, at its row's height times its own scale and as wide as its
 * viewBox makes that. Named for a screen reader and, under the pointer or
 * focus, in its own colour and in words under it. A place of work with a
 * site links to it.
 *
 * A `type` logo is its name, set in type. A place's mark alone in its
 * chapter, `named`, has its name beside it all the time, as a lockup: one
 * emblem on its own says too little to be known by.
 */
function Logo({ id, named = false, href }: { id: LogoId; named?: boolean; href?: string }): ReactElement {
  const logo: LogoData = LOGOS[id]
  const style = {
    '--cv-scale': logo.scale,
    '--cv-brand': logo.hex ?? 'var(--lb-ink-strong, #101014)',
  } as CSSProperties
  if (logo.kind === 'type') {
    return href ? (
      <a className="cv-logo is-type" style={style} href={href} target="_blank" rel="noreferrer">
        {logo.name}
      </a>
    ) : (
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
      <Shell href={href} className="cv-logo is-named" aria-label={logo.name} style={style}>
        {mark}
        <span className="cv-logo-type" aria-hidden="true">
          {logo.name}
        </span>
      </Shell>
    )
  }
  return (
    <Shell
      href={href}
      className="cv-logo"
      aria-label={logo.name}
      tabIndex={href ? undefined : 0}
      style={style}
      onPointerEnter={keepNameIn}
      onFocus={keepNameIn}
    >
      {mark}
      <span className="cv-logo-name" aria-hidden="true">
        {logo.name}
      </span>
    </Shell>
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
            <Logo key={id} id={id} named={named} href={siteOf(id)} />
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

/** Copy in its paragraphs, a line break each, every one set by `line`. One block, so the face still rises in four lines. */
function Copy({ text, line }: { text: string; line: (paragraph: string) => ReactNode }): ReactElement {
  return (
    <div className="cv-copy">
      {text.split('\n').map((paragraph, i) => (
        <p key={i}>{line(paragraph)}</p>
      ))}
    </div>
  )
}

/**
 * Text with its links: a company it names to its site, in a new tab, and an
 * instrument to itself, in this one, as the title's names go.
 */
function withLinks(text: string): ReactNode {
  return copyParts(text).map((p, i) =>
    p.href?.startsWith('https://') ? (
      <a key={i} className="cv-link" href={p.href} target="_blank" rel="noreferrer">
        {p.text}
      </a>
    ) : p.href ? (
      <a key={i} className="cv-link" href={p.href}>
        {p.text}
      </a>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  )
}

/** A chapter: when and where, the line it is, what happened, and the logos. */
function ChapterFace({ chapter }: { chapter: Chapter }): ReactElement {
  return (
    <>
      <p className="cv-kicker">{kickerOf(chapter)}</p>
      <h2 className="cv-headline">{chapter.headline}</h2>
      <Copy text={chapter.copy} line={withLinks} />
      <Logos chapter={chapter} />
    </>
  )
}

/**
 * The cover, the face before any chapter: where, a hello, who he is and the
 * ways in. Play and CV in it press the dock's buttons, each with its mark, so
 * the words teach the dock. A company it names links out, as in a chapter.
 */
function CoverFace({ actions }: { actions?: StoryActions }): ReactElement {
  const { cover } = LIFE
  return (
    <>
      <p className="cv-kicker">{cover.kicker}</p>
      <h2 className="cv-headline">{cover.headline}</h2>
      <Copy
        text={cover.copy}
        line={(paragraph) =>
          paragraph.split(/\b(Play|CV)\b/).map((part, i) =>
            part === 'Play' || part === 'CV' ? (
              <button key={i} type="button" className="cv-link cv-press" onClick={part === 'Play' ? actions?.play : actions?.paper}>
                {part === 'Play' ? <PlayIcon /> : <PageIcon />}
                {part}
              </button>
            ) : (
              <span key={i}>{withLinks(part)}</span>
            ),
          )
        }
      />
    </>
  )
}

function Face({ chapter, actions }: { chapter: number; actions?: StoryActions }): ReactElement | null {
  if (chapter === COVER) return <CoverFace actions={actions} />
  const c = LIFE.chapters[chapter]
  return c ? <ChapterFace chapter={c} /> : null
}

/**
 * Every face, the cover's too, unseen, in the same cell, for App.tsx to lay
 * the sheets under the tallest. They never change, so the story's every move
 * leaves them be.
 */
const Probe = memo(function Probe({ probeRef }: { probeRef: Ref<HTMLDivElement> }): ReactElement {
  return (
    <div ref={probeRef} className="cv-faces cv-probe" aria-hidden="true" inert>
      {[COVER, ...LIFE.chapters.keys()].map((i) => (
        <div key={i} className="cv-face">
          <Face chapter={i} />
        </div>
      ))}
    </div>
  )
})

/** A face as it is up: which, and the how-manyth, so a chapter come back to is a new face. */
interface Up {
  chapter: number
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
 * read, or the cover. It stays when the rest of the chrome rests, and a press on it is
 * never only a wake, so a recruiter's first tap on a link follows it.
 *
 * A new face rises in line by line as the old one fades up and away, laid
 * over it so the story keeps its place. Every move sends the face that is up
 * out as it is, still rising or not, so a quick scrub fades through the faces
 * it passes and never blinks to nothing; each is gone in LEAVE_MS. Focus in
 * a face that goes out stays in the story.
 */
export function Story({
  snap,
  high,
  actions,
  storyRef,
  probeRef,
}: {
  snap: Snapshot
  /** Starting right under the title (App.tsx). */
  high: boolean
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
      className={`cv-story${snap.paper ? ' is-reading' : ''}${high ? ' is-high' : ''}`}
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
