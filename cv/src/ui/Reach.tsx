import type { CSSProperties, ReactElement } from 'react'
import { GLYPHS } from '../glyphs'
import { LIFE, WEB } from '../life'
import { LOGOS } from '../logos'

export type Way = 'email' | (typeof WEB)[number]

/** Lucide's mail, so it is nobody's mark, its envelope as wide as the square marks. */
const ENVELOPE = {
  viewBox: '0 0 24 24',
  body: `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS.mail}</g>`,
  scale: 0.95,
}

/** One way's mark, at the line's `--cv-mark` times its optical scale, as the story's logos are. */
export function Mark({ way }: { way: Way }): ReactElement {
  const { viewBox, body, scale } = way === 'email' ? ENVELOPE : LOGOS[way]
  const [, , w, h] = viewBox.split(' ').map(Number)
  return (
    <svg
      className="cv-mark"
      viewBox={viewBox}
      aria-hidden="true"
      style={{ '--cv-scale': scale, aspectRatio: `${w} / ${h}` } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}

/**
 * The four ways to reach him, in the corner across from the title on every
 * face. Email is copied; the rest open in a new tab, so the page keeps its
 * place.
 */
export function Reach({ away, copyEmail }: { away: boolean; copyEmail: () => void }): ReactElement {
  const { reach } = LIFE
  const copy = `Copy ${reach.email}`
  return (
    <nav className={`cv-ways${away ? ' is-away' : ''}`} aria-label="Reach">
      <button type="button" className="cv-way" title={copy} aria-label={copy} onClick={copyEmail}>
        <Mark way="email" />
      </button>
      {WEB.map((id) => (
        <a
          key={id}
          className="cv-way"
          href={reach[id]}
          target="_blank"
          rel="noreferrer"
          title={LOGOS[id].name}
          aria-label={LOGOS[id].name}
        >
          <Mark way={id} />
        </a>
      ))}
    </nav>
  )
}
