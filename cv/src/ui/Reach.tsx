import type { CSSProperties, ReactElement } from 'react'
import { LIFE, WEB } from '../life'
import { LOGOS } from '../logos'

export type Way = 'email' | (typeof WEB)[number]

/**
 * A plain envelope in outline, drawn here so it is nobody's mark, as wide as
 * the square marks. One path, so the faint ink is laid once where the flap
 * meets the sides.
 */
const ENVELOPE = {
  viewBox: '0 0 20 16',
  body:
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'd="M3.5 1h13A2.5 2.5 0 0 1 19 3.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 1 12.5v-9A2.5 2.5 0 0 1 3.5 1z' +
    'M1.5 3.5l8.5 6 8.5-6"/>',
  scale: 0.7,
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
 * face, so nobody has to wait for Now to come round. Email is copied, as on
 * Now; the rest open in a new tab, so the page keeps its place.
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
