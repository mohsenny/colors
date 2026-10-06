import { useEffect, useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import type { Snapshot } from '../app/instrument'
import { LIFE, bare, facts, yearsOf } from '../life'
import type { Chapter, Crossing, Role } from '../life'
import { closingParts } from '../text'
import { chapterHex, chapterOf, crossingHex } from './hex'

/** The crossfade between two cards, as `--lb-t-grow`. */
const FADE_MS = 180

export interface CardActions {
  go: (index: number) => void
  goCrossing: (index: number) => void
  togglePaper: () => void
  copyEmail: () => void
  /** The pointer is on the card, so Play waits. */
  hold: (on: boolean) => void
}

/** A chapter's years where they start a line, `Until 2008`. */
function years(chapter: Chapter): string {
  const said = yearsOf(chapter)
  return said.charAt(0).toUpperCase() + said.slice(1)
}

function Swatch({ hex }: { hex: string }): ReactElement {
  return <span className="lb-tray-swatch" style={{ '--lb-swatch': hex } as CSSProperties} aria-hidden="true" />
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <>
      <dt className="lt-readout-label">{label}</dt>
      <dd className="cv-card-value">{children}</dd>
    </>
  )
}

/** Several roles in one chapter, each where it was and when. One role is the chapter, and its dates go on the name row. */
function Roles({ roles }: { roles: Role[] }): ReactElement {
  return (
    <ul className="cv-card-roles">
      {roles.map((r) => (
        <li key={`${r.org} ${r.from}`}>
          <span>{r.short ?? r.org}</span>
          <span className="lt-readout-value">
            {r.from} to {r.to}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** At Now: who, what now, before, studied, where, and how to reach him. */
function FactsCard({ copyEmail }: Pick<CardActions, 'copyEmail'>): ReactElement {
  const { reach } = LIFE
  return (
    <>
      <div className="lt-readout-name">{LIFE.name}</div>
      <p className="cv-card-copy">{LIFE.intro}</p>
      <dl className="cv-card-rows">
        {facts()
          .filter((f) => f.label !== 'Reach')
          .map((f) => (
            <Row key={f.label} label={f.label}>
              {f.value}
            </Row>
          ))}
        <Row label="Reach">
          <button type="button" className="cv-card-link" onClick={copyEmail}>
            {reach.email}
          </button>
          {[reach.linkedin, reach.github, reach.medium].map((url) => (
            <a key={url} className="cv-card-link" href={url} target="_blank" rel="noreferrer">
              {bare(url)}
            </a>
          ))}
        </Row>
      </dl>
    </>
  )
}

/** A chapter: its years and place, its roles, the copy, and the chapter it crossed. */
function ChapterCard({ index, actions }: { index: number; actions: CardActions }): ReactElement {
  const c = LIFE.chapters[index] as Chapter
  const crossing = LIFE.crossings.findIndex((x) => x.a === c.id || x.b === c.id)
  const x = LIFE.crossings[crossing]
  const other = x ? LIFE.chapters[chapterOf(x.a === c.id ? x.b : x.a)] : undefined
  const one = c.roles?.length === 1 ? c.roles[0] : undefined
  return (
    <>
      <div className="lt-readout-name">
        <Swatch hex={chapterHex(index)} />
        <span>{c.name}</span>
        <span className="cv-card-years">{one ? `${one.from} to ${one.to}` : years(c)}</span>
      </div>
      {c.where && c.where !== c.name && (
        <dl className="cv-card-rows">
          <Row label="Place">{c.where}</Row>
        </dl>
      )}
      {c.roles && c.roles.length > 1 && <Roles roles={c.roles} />}
      <p className="cv-card-copy">{c.copy}</p>
      {x && other && (
        <button type="button" className="cv-card-cross" onClick={() => actions.goCrossing(crossing)}>
          <Swatch hex={crossingHex(x)} />
          <span>{x.name}</span>
          <span className="cv-card-with">{other.name}</span>
        </button>
      )}
      {c.id === LIFE.chapters.at(-1)?.id && (
        <p className="cv-card-copy cv-card-closing">
          {closingParts(LIFE.closing).map((p, i) =>
            p.href ? (
              <a key={i} className="cv-card-link" href={p.href}>
                {p.text}
              </a>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </p>
      )}
    </>
  )
}

/** Where two chapters ran at once: the colour they make, the two of them, and what that was. */
function CrossingCard({ index, actions }: { index: number; actions: CardActions }): ReactElement {
  const x = LIFE.crossings[index] as Crossing
  const pair = [x.a, x.b].map(chapterOf).sort((a, b) => a - b)
  return (
    <>
      <div className="lt-readout-name">
        <Swatch hex={crossingHex(x)} />
        <span>{x.name}</span>
      </div>
      <ul className="cv-card-roles">
        {pair.map((i) => {
          const c = LIFE.chapters[i] as Chapter
          return (
            <li key={c.id}>
              <button type="button" className="cv-card-cross" onClick={() => actions.go(i)}>
                <Swatch hex={chapterHex(i)} />
                <span>{c.name}</span>
              </button>
              <span className="lt-readout-value">{years(c)}</span>
            </li>
          )
        })}
      </ul>
      <p className="cv-card-copy">{x.copy}</p>
    </>
  )
}

type Face = { kind: 'facts' } | { kind: 'chapter'; index: number } | { kind: 'crossing'; index: number }

function faceOf(snap: Snapshot): Face {
  if (snap.crossing !== null) return { kind: 'crossing', index: snap.crossing }
  if (snap.chapter !== null) return { kind: 'chapter', index: snap.chapter }
  return { kind: 'facts' }
}

function keyOf(face: Face): string {
  return face.kind === 'facts' ? 'facts' : `${face.kind}-${face.index}`
}

function Body({ face, actions }: { face: Face; actions: CardActions }): ReactElement {
  if (face.kind === 'chapter') return <ChapterCard index={face.index} actions={actions} />
  if (face.kind === 'crossing') return <CrossingCard index={face.index} actions={actions} />
  return <FactsCard copyEmail={actions.copyEmail} />
}

/**
 * Top right, where Solar's readout is and on its glass: the facts at Now, the
 * chapter or the crossing otherwise, and always the way to the text. It stays
 * when the rest of the chrome rests, and a press on it is never only a wake,
 * so a recruiter's first tap on the email copies it.
 *
 * A new card fades in over the old one fading out, the old one laid over the
 * new rather than beside it, so the card takes the new one's height at once.
 */
export function Card({
  snap,
  actions,
  cardRef,
}: {
  snap: Snapshot
  actions: CardActions
  cardRef: (el: HTMLElement | null) => void
}): ReactElement {
  const face = faceOf(snap)
  const key = keyOf(face)
  const [shown, setShown] = useState<Face>(face)
  const [leaving, setLeaving] = useState<Face | null>(null)
  // A new face is taken in while rendering, so the old one never draws a
  // frame on its own after the instrument has moved on.
  if (keyOf(shown) !== key) {
    setShown(face)
    setLeaving(shown)
  }

  useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => setLeaving(null), FADE_MS)
    return () => window.clearTimeout(t)
  }, [leaving])

  return (
    <aside
      ref={cardRef}
      className={`lb-tray lt-readout cv-card${snap.paper ? ' is-reading' : ''}`}
      data-awake=""
      aria-label="About Mohsen"
      onPointerEnter={() => actions.hold(true)}
      onPointerLeave={() => actions.hold(false)}
    >
      <div className="lb-tray-list">
        <div className="cv-card-faces">
          <div key={key} className={`cv-card-face${leaving ? ' is-entering' : ''}`}>
            <Body face={face} actions={actions} />
          </div>
          {leaving && (
            <div key={`out-${keyOf(leaving)}`} className="cv-card-face is-leaving" aria-hidden="true" inert>
              <Body face={leaving} actions={actions} />
            </div>
          )}
          <div className="cv-card-face cv-card-probe" aria-hidden="true" inert>
            <FactsCard copyEmail={actions.copyEmail} />
          </div>
        </div>
        <button type="button" className="cv-card-text" aria-pressed={snap.paper} onClick={actions.togglePaper}>
          <span>CV as text</span>
          <span className="lt-readout-label" aria-hidden="true">T</span>
        </button>
      </div>
    </aside>
  )
}
